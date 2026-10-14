"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const RUTA = "/creacion-ofertas";
const MODULO = "creacion-ofertas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OFERTAS = 3;

/** Comprueba que la fila de Selección exista y sea de un país que la persona ve. */
async function filaPermitida(seleccionId: string, permitidos: string[] | null) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_seleccion_productos").select("id, nombre, pais_id").eq("id", seleccionId).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id))) return null;
  return data;
}

/**
 * Crea o guarda una oferta de un producto (de 1 a 3 por producto): nombre («2x1»), unidades y precio en dólares. Sin `id` la
 * crea en el siguiente lugar libre. Devuelve el error como valor.
 */
export async function guardarOferta(datos: {
  id?: string;
  seleccionId: string;
  nombre: string;
  unidades: number;
  precio: number | null;
  notas?: string;
}): Promise<{ error?: string; id?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const nombre = String(datos.nombre ?? "").trim().slice(0, 120);
  const unidades = Number(datos.unidades);
  const precio = datos.precio === null || datos.precio === undefined || (datos.precio as unknown) === "" ? null : Number(datos.precio);
  const notas = String(datos.notas ?? "").trim().slice(0, 2000) || null;
  if (!UUID.test(datos.seleccionId) || (datos.id && !UUID.test(datos.id))) return { error: "Oferta no válida." };
  if (!nombre) return { error: "Escribe el nombre de la oferta (p. ej. «2x1»)." };
  if (!Number.isInteger(unidades) || unidades < 1 || unidades > 99) return { error: "Las unidades van de 1 a 99." };
  if (precio !== null && !(Number.isFinite(precio) && precio >= 0 && precio < 1_000_000)) return { error: "El precio no es válido." };

  const fila = await filaPermitida(datos.seleccionId, usuario.paisesPermitidos);
  if (!fila) return { error: "El producto ya no existe o no es de tus países." };
  const supabase = createServiceClient();
  const valores = { nombre, unidades, precio: precio === null ? null : Math.round(precio * 100) / 100, notas, actualizado_en: new Date().toISOString() };

  if (datos.id) {
    const { error } = await supabase.from("wms_seleccion_ofertas").update(valores).eq("id", datos.id).eq("seleccion_id", fila.id);
    if (error) return { error: "No se pudo guardar la oferta." };
    revalidatePath(RUTA);
    return { id: datos.id };
  }

  const { data: actuales } = await supabase.from("wms_seleccion_ofertas").select("orden").eq("seleccion_id", fila.id);
  const usados = new Set((actuales ?? []).map((o) => o.orden));
  const orden = [1, 2, 3].find((n) => !usados.has(n));
  if (!orden) return { error: `Un producto tiene ${MAX_OFERTAS} ofertas como máximo.` };
  const { data, error } = await supabase
    .from("wms_seleccion_ofertas")
    .insert({ ...valores, seleccion_id: fila.id, orden, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la oferta." };
  await registrarAuditoria({ accion: "crear_oferta_seleccion", entidad: "wms_seleccion_productos", entidadId: fila.id, detalle: `Oferta ${orden}: ${nombre}` });
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  return { id: data.id };
}

/** Quita una oferta de un producto. */
export async function eliminarOferta(id: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(id)) return { error: "Oferta no válida." };
  const supabase = createServiceClient();
  const { data: oferta } = await supabase.from("wms_seleccion_ofertas").select("id, nombre, orden, seleccion_id").eq("id", id).maybeSingle();
  if (!oferta) return {};
  if (!(await filaPermitida(oferta.seleccion_id, usuario.paisesPermitidos))) return { error: "El producto no es de tus países." };
  const { error } = await supabase.from("wms_seleccion_ofertas").delete().eq("id", id);
  if (error) return { error: "No se pudo quitar la oferta." };
  await registrarAuditoria({ accion: "eliminar_oferta_seleccion", entidad: "wms_seleccion_productos", entidadId: oferta.seleccion_id, detalle: `Oferta ${oferta.orden}: ${oferta.nombre}` });
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  return {};
}
