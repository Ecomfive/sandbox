"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";

const RUTA = "/scraping-proveedores";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El enlace de un proveedor en Dropi: `https://app.dropi.<país>/dashboard/provider/<id>/<nombre>`. */
function leerEnlace(url: string): { pais: string; dropiId: number; url: string } | null {
  try {
    const u = new URL(url.trim());
    const pais = /^app\.dropi\.([a-z]{2})$/.exec(u.hostname)?.[1];
    const id = /^\/dashboard\/provider\/(\d+)(\/|$)/.exec(u.pathname)?.[1];
    if (u.protocol !== "https:" || !pais || !id) return null;
    return { pais, dropiId: Number(id), url: `${u.origin}${u.pathname}` };
  } catch {
    return null;
  }
}

function cifras(formData: FormData): { ordenes: number; productos: number; dropshippers: number } | { error: string } {
  const valores = ["ordenes", "productos", "dropshippers"].map((k) => String(formData.get(k) ?? "").replace(/[\s.,]/g, ""));
  if (valores.some((v) => !/^\d{1,9}$/.test(v))) return { error: "Escribe órdenes, productos y dropshippers como números enteros." };
  const [ordenes, productos, dropshippers] = valores.map(Number);
  return { ordenes, productos, dropshippers };
}

/** «Agregar proveedor»: lo guarda con sus cifras de hoy y deja pedida su primera búsqueda completa. */
export async function agregarProveedor(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 200);
  const enlace = leerEnlace(String(formData.get("url") ?? ""));
  if (!nombre) return { error: "Escribe el nombre del proveedor." };
  if (!enlace) return { error: "Pega el enlace del proveedor en Dropi (https://app.dropi.mx/dashboard/provider/…)." };
  const c = cifras(formData);
  if ("error" in c) return c;

  const supabase = createServiceClient();
  const { data: existe } = await supabase.from("scraping_proveedores").select("id").eq("pais", enlace.pais).eq("dropi_id", enlace.dropiId).maybeSingle();
  if (existe) return { error: "Ese proveedor ya está en la lista." };
  const { data: prov, error } = await supabase
    .from("scraping_proveedores")
    .insert({ nombre, pais: enlace.pais, dropi_url: enlace.url, dropi_id: enlace.dropiId, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !prov) return { error: error?.message ?? "No se pudo guardar el proveedor." };
  await supabase.from("scraping_proveedor_registros").insert({ proveedor_id: prov.id, ...c, creado_por: usuario.id });
  await supabase.from("scraping_busquedas").insert({ proveedor_id: prov.id, estado: "pendiente", pedida_por: usuario.id });
  await registrarAuditoria({ accion: "agregar_proveedor_scraping", entidad: "scraping_proveedores", entidadId: prov.id, detalle: nombre });
  revalidatePath(RUTA);
  return {};
}

/** «Actualizar datos del proveedor»: las cifras de hoy, para comparar con las anteriores. */
export async function registrarDatosProveedor(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  const id = String(formData.get("proveedor_id") ?? "");
  if (!UUID.test(id)) return { error: "Proveedor no válido." };
  const c = cifras(formData);
  if ("error" in c) return c;
  const supabase = createServiceClient();
  const { error } = await supabase.from("scraping_proveedor_registros").insert({ proveedor_id: id, ...c, creado_por: usuario.id });
  if (error) return { error: error.message };
  revalidatePath(RUTA);
  return {};
}

/** «Buscar ahora»: deja pedida una búsqueda completa (la corre el equipo con la sesión de Dropi). */
export async function pedirBusqueda(proveedorId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  if (!UUID.test(proveedorId)) return { error: "Proveedor no válido." };
  const supabase = createServiceClient();
  const { data: abierta } = await supabase.from("scraping_busquedas").select("id").eq("proveedor_id", proveedorId).in("estado", ["pendiente", "corriendo"]).limit(1).maybeSingle();
  if (abierta) return { error: "Ya hay una búsqueda pedida para este proveedor." };
  const { error } = await supabase.from("scraping_busquedas").insert({ proveedor_id: proveedorId, estado: "pendiente", pedida_por: usuario.id });
  if (error) return { error: error.message };
  revalidatePath(RUTA);
  return {};
}

export interface EventoProducto {
  fecha: string;
  evento: string;
  precio: number | null;
  stock: number | null;
  precioAntes: number | null;
  stockAntes: number | null;
  detalle: string | null;
}

/** Todo el historial de un producto (lo pide su ficha al abrirse), del más nuevo al más viejo. */
export async function obtenerHistorialProducto(productoId: string): Promise<{ eventos?: EventoProducto[]; error?: string }> {
  await requireModulo("scraping-proveedores");
  if (!UUID.test(productoId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("scraping_producto_historial")
    .select("fecha, evento, precio, stock, precio_antes, stock_antes, detalle")
    .eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(300);
  if (error) return { error: error.message };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    eventos: (data ?? []).map((e) => ({
      fecha: e.fecha,
      evento: e.evento,
      precio: n(e.precio),
      stock: e.stock,
      precioAntes: n(e.precio_antes),
      stockAntes: e.stock_antes,
      detalle: e.detalle,
    })),
  };
}
