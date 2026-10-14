"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { aDolares, monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { motivoYaVisto, yaVisto } from "@/lib/scraping/cruces";
import { cargarReferencias } from "@/lib/scraping/referencias";
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

/**
 * «Enviar a Selección»: crea una fila de Selección de productos por cada producto (fuente Scraping de proveedores, su
 * correlativo SP-0001, en el país del proveedor y con sus precios pasados a dólares). Llega **Seleccionado**; si ya se testeó
 * o ya está en Producto llega **Descartado** con la nota del motivo. Un producto ya enviado no se vuelve a crear. Hasta 100.
 */
export async function enviarASeleccion(ids: string[]): Promise<{ error?: string; enviados?: number; descartados?: number; yaEstaban?: number }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  if (!usuario.modulos.includes("seleccion-productos") || usuario.modulosSoloLectura.includes("seleccion-productos"))
    return { error: "Tu rol no puede agregar a Selección de productos." };
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: "Selección no válida." };

  const supabase = createServiceClient();
  const { data: prods, error } = await supabase
    .from("scraping_productos")
    .select("id, dropi_producto_id, nombre, foto_url, foto_huella, precio, precio_sugerido, categoria, scraping_proveedores(nombre, pais, dropi_url)")
    .in("id", ids);
  if (error) return { error: "No se pudieron leer los productos. ¿Ya se corrió la migración 0107?" };
  const { data: ya, error: errorYa } = await supabase.from("wms_seleccion_productos").select("scraping_producto_id").in("scraping_producto_id", ids);
  if (errorYa) return { error: "Falta correr las migraciones 0104 y 0107 (Selección de productos)." };
  const enviados = new Set((ya ?? []).map((y) => y.scraping_producto_id));
  const nuevos = (prods ?? []).filter((p) => !enviados.has(p.id));
  if (!nuevos.length) return { enviados: 0, descartados: 0, yaEstaban: enviados.size };

  const [{ porUsd }, indice, { data: paises }] = await Promise.all([tasasUsd(supabase), cargarReferencias(supabase), supabase.from("paises").select("id, codigo")]);
  const paisId = new Map((paises ?? []).map((p) => [String(p.codigo).toLowerCase(), p.id]));
  const filas = [];
  for (const p of nuevos) {
    const prov = (Array.isArray(p.scraping_proveedores) ? p.scraping_proveedores[0] : p.scraping_proveedores) as { nombre: string; pais: string; dropi_url: string } | null;
    if (!prov) continue;
    const pais = paisId.get(prov.pais);
    if (!pais) return { error: `El país del proveedor (${prov.pais.toUpperCase()}) no está en Configuración › Países.` };
    const { data: codigo, error: errorCodigo } = await supabase.rpc("wms_siguiente_codigo_fuente", { p_fuente: "scraping_proveedores" });
    if (errorCodigo || !codigo) return { error: "No se pudo dar el código SP. ¿Ya se corrió la migración 0104?" };
    const moneda = monedaDePais(prov.pais);
    const visto = yaVisto(p.nombre, p.foto_huella, indice);
    filas.push({
      pais_id: pais,
      nombre: p.nombre,
      estado: visto ? "descartado" : "seleccionado",
      motivo_descarte: visto ? motivoYaVisto(visto) : null,
      fuente: "scraping_proveedores",
      codigo_fuente: codigo as string,
      foto_url: p.foto_url,
      url_pagina: prov.dropi_url,
      costo_proveedor: aDolares(p.precio === null ? null : Number(p.precio), moneda, porUsd),
      precio_venta: aDolares(p.precio_sugerido === null ? null : Number(p.precio_sugerido), moneda, porUsd),
      precio_original: p.precio,
      moneda_original: moneda,
      categoria: p.categoria?.split(", ")[0]?.slice(0, 80) ?? null,
      notas: `Proveedor ${prov.nombre} · ID Dropi ${p.dropi_producto_id}`,
      scraping_producto_id: p.id,
      creado_por: usuario.id,
    });
  }
  const { data: creadas, error: errorCrear } = await supabase.from("wms_seleccion_productos").insert(filas).select("id, codigo_fuente, nombre, estado");
  if (errorCrear) return { error: "No se pudieron crear las filas en Selección." };
  await registrarAuditoriaLote(
    (creadas ?? []).map((c) => ({
      accion: "crear_seleccion",
      entidad: "wms_seleccion_productos",
      entidadId: c.id,
      detalle: `${c.codigo_fuente} · ${c.nombre} (desde Scraping de proveedores${c.estado === "descartado" ? ", descartado: ya visto" : ""})`,
    })),
  );
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  return { enviados: creadas?.length ?? 0, descartados: (creadas ?? []).filter((c) => c.estado === "descartado").length, yaEstaban: enviados.size };
}
