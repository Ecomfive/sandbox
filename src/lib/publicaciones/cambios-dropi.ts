// La cola de cambios del sistema en Dropi (migración 0137): hoy, el nombre de un producto y el de su guía de envío, que deja «Usar
// este título» del Asistente de IA. Dropi rechaza (403) las llamadas que salen de un servidor, así que no se aplican desde aquí: los
// aplica el favorito «Aplicar en Dropi» desde la pestaña de Dropi (marcador-aplicar-dropi.ts) y la ventana que abre guarda el
// resultado (aplicar-actions.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_NOMBRE_DROPI } from "./dropi-guardado";
import { idsDeDropi } from "./sincronizar-dropi";

export type EstadoCambioDropi = "pendiente" | "aplicado" | "error" | "reemplazado";

/** El último cambio en Dropi de una publicación, para la ficha. */
export interface CambioDropiVista {
  id: string;
  /** «cambio» = nombre y/o precios; «republicar» = crear el producto de nuevo en Dropi (migración 0145). */
  tipo: "cambio" | "republicar" | "apagar";
  /** El ID del producto nuevo de una republicación, cuando Dropi ya lo creó. */
  nuevoDropiId: number | null;
  estado: EstadoCambioDropi;
  /** null si el cambio no toca el nombre (solo el precio). */
  nombre: string | null;
  nombreGuia: string | null;
  precio: number | null;
  precioSugerido: number | null;
  error: string | null;
  creadoEn: string;
  aplicadoEn: string | null;
}

/** Lo que lleva un cambio para Dropi. Lo que no se pone (`undefined`) se conserva del cambio pendiente que ya hubiera. */
export interface CambioDropi {
  nombre?: string | null;
  nombreGuia?: string | null;
  precio?: number | null;
  precioSugerido?: number | null;
  /** El precio que tenía antes (para mostrar «de … a …»). */
  precioAntes?: number | null;
  precioSugeridoAntes?: number | null;
}

/**
 * Deja un cambio en la cola de «Aplicar en Dropi» (migración 0137; precio y precio sugerido desde la 0139). Si la publicación ya
 * tenía un cambio esperando (pendiente o con error), se juntan en uno nuevo y el anterior queda «reemplazado»: así un nombre y un
 * precio pendientes van juntos a Dropi. Necesita un ID de Dropi; con dos («8165/7409») va al primero.
 */
export async function encolarCambio(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: CambioDropi,
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const conPrecio = cambio.precio !== undefined || cambio.precioSugerido !== undefined;
  // Una republicación esperando (migración 0145) no se junta con un cambio de nombre o de precio.
  const consulta = (columnas: string, sinRepublicar: boolean) => {
    const q = supabase.from("dropi_cambios_pendientes").select(columnas).eq("publicacion_id", pub.id).in("estado", ["pendiente", "error"]);
    return (sinRepublicar ? q.eq("tipo", "cambio") : q).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  };
  const leer = async (columnas: string) => {
    const r = await consulta(columnas, true);
    return r.error ? consulta(columnas, false) : r;
  };
  let previo = await leer("id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  const hayPrecios = !previo.error;
  if (!hayPrecios) {
    if (conPrecio) return { error: "Falta correr en Supabase la migración 0139 para mandar precios a Dropi." };
    previo = await leer("id, nombre, nombre_guia");
  }
  const p = (previo.data ?? null) as Record<string, unknown> | null;
  const elegir = <T,>(nuevo: T | undefined, viejo: unknown): T | null => (nuevo !== undefined ? nuevo : ((viejo as T | null | undefined) ?? null));
  const fila: Record<string, unknown> = {
    pais_id: pub.pais_id,
    publicacion_id: pub.id,
    dropi_producto_id: productoId,
    nombre: elegir(cambio.nombre, p?.nombre),
    nombre_guia: elegir(cambio.nombreGuia, p?.nombre_guia),
    creado_por: por.id,
    creado_por_nombre: por.nombre,
  };
  if (hayPrecios) {
    fila.precio = elegir(cambio.precio, p?.precio);
    fila.precio_sugerido = elegir(cambio.precioSugerido, p?.precio_sugerido);
    // El «antes» es el de la primera vez que se pidió el cambio (el que de verdad tenía Dropi).
    fila.precio_antes = p?.precio_antes ?? cambio.precioAntes ?? null;
    fila.precio_sugerido_antes = p?.precio_sugerido_antes ?? cambio.precioSugeridoAntes ?? null;
  }
  if (p?.id) await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("id", p.id as string);
  const { data, error } = await supabase.from("dropi_cambios_pendientes").insert(fila).select("id").single();
  if (error || !data) return { error: /does not exist|schema cache/i.test(error?.message ?? "") ? "Falta correr en Supabase la migración 0137." : "No se pudo dejar el cambio para Dropi." };
  return { id: data.id as string };
}

/**
 * «Republicar» (pedido de Hernán, 23 oct 2026; migración 0145): deja en la cola de «Aplicar en Dropi» que se cree de nuevo el
 * producto en Dropi (mismos datos, fotos y stock) y se archive el viejo sin stock. Si ya había una esperando, no se agrega otra.
 */
export async function encolarRepublicar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", pub.id).eq("tipo", "republicar").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0145." : "No se pudo dejar la republicación para Dropi." };
  if (previo.data) return { id: previo.data.id as string, yaEstaba: true };
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "republicar", creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0145." : "No se pudo dejar la republicación para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Apagar en Dropi» (pedido de Hernán, 23 oct 2026; migración 0148): deja en la cola que se saque todo el stock del producto en Dropi
 * (con `quitarPrivados`, también su privatización) y se archive. Si ya había un apagado esperando, no se agrega otro (el pendiente
 * se reintenta solo en cada «Aplicar en Dropi»; si antes no pedía quitar privados y ahora sí, se actualiza).
 */
export async function encolarApagar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  opciones: { quitarPrivados: boolean },
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache|quitar_privados/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id, quitar_privados").eq("publicacion_id", pub.id).eq("tipo", "apagar").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0148." : "No se pudo dejar el apagado para Dropi." };
  if (previo.data) {
    if (opciones.quitarPrivados && !previo.data.quitar_privados) await supabase.from("dropi_cambios_pendientes").update({ quitar_privados: true }).eq("id", previo.data.id as string);
    return { id: previo.data.id as string, yaEstaba: true };
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "apagar", quitar_privados: opciones.quitarPrivados, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0148." : "No se pudo dejar el apagado para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/** El cambio de nombre (y el de la guía) para Dropi; se junta con un cambio de precio pendiente si lo hay. */
export async function encolarCambioNombre(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: { nombre: string; nombreGuia: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  return encolarCambio(supabase, pub, { nombre: cambio.nombre, nombreGuia: cambio.nombreGuia }, por);
}

/**
 * Un precio nuevo, también para Dropi (22 oct 2026): al aceptar «Subir precio» o «Bajar precio frente a la competencia», o al
 * cambiarlo en la ficha. Queda en la cola y lo aplica «Aplicar en Dropi».
 */
export async function enviarPrecioADropi(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  precio: number,
  precioAntes: number | null,
  por: { id: string; nombre: string },
): Promise<{ estado: "pendiente" | "error"; detalle: string }> {
  // El sugerido va siempre igual al precio (decisión de Alcides, 23 oct 2026): así Dropi no le impide al dropshipper vender por debajo.
  const r = await encolarCambio(supabase, pub, { precio, precioAntes, precioSugerido: precio }, por);
  if ("error" in r) return { estado: "error", detalle: r.error };
  return { estado: "pendiente", detalle: `Precio $${precio.toFixed(2)} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.` };
}

/**
 * Un nombre nuevo, también para Dropi (pedido de Hernán, 22 oct 2026): «Nombre del producto» = el nombre y «Nombre del producto en
 * la guía de envío» = el código del SKU vinculado (lo que ve despacho). Queda pendiente y lo aplica el favorito «Aplicar en Dropi».
 * Lo usan «Usar este título» del Asistente de IA y la edición del nombre en la ficha.
 */
export async function enviarNombreADropi(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null; sku_maestro_id: string | null },
  nombre: string,
  por: { id: string; nombre: string },
): Promise<{ estado: "pendiente" | "error"; detalle: string }> {
  const { data: sku } = pub.sku_maestro_id ? await supabase.from("skus_maestros").select("codigo").eq("id", pub.sku_maestro_id).maybeSingle() : { data: null };
  const codigo = (sku?.codigo as string | undefined)?.trim() || null;
  const nombreGuia = codigo && codigo.length <= MAX_NOMBRE_DROPI ? codigo : null;
  const encolado = await encolarCambioNombre(supabase, pub, { nombre, nombreGuia }, por);
  if ("error" in encolado) return { estado: "error", detalle: encolado.error };
  return { estado: "pendiente", detalle: `Para Dropi${nombreGuia ? ` (guía: ${nombreGuia})` : ""}: pulsa «Aplicar en Dropi» con Dropi abierto.` };
}

/** El último cambio en Dropi de cada publicación del país y cuántos siguen pendientes. Sin la migración 0137, vacío. */
export async function cargarCambiosDropi(supabase: SupabaseClient, paisId: string): Promise<{ porPublicacion: Map<string, CambioDropiVista>; pendientes: number }> {
  const porPublicacion = new Map<string, CambioDropiVista>();
  const leer = (columnas: string) =>
    supabase.from("dropi_cambios_pendientes").select(columnas).eq("pais_id", paisId).neq("estado", "reemplazado").order("creado_en", { ascending: false }).limit(2000);
  let r = await leer("id, publicacion_id, tipo, nuevo_dropi_id, estado, nombre, nombre_guia, precio, precio_sugerido, error, creado_en, aplicado_en");
  // Sin la migración 0145, sin republicaciones; sin la 0139, sin precios.
  if (r.error) r = await leer("id, publicacion_id, estado, nombre, nombre_guia, precio, precio_sugerido, error, creado_en, aplicado_en");
  if (r.error) r = await leer("id, publicacion_id, estado, nombre, nombre_guia, error, creado_en, aplicado_en");
  const { data, error } = r as unknown as { data: Record<string, unknown>[] | null; error: unknown };
  if (error) return { porPublicacion, pendientes: 0 };
  let pendientes = 0;
  for (const f of data ?? []) {
    if (f.estado === "pendiente") pendientes++;
    if (porPublicacion.has(f.publicacion_id as string)) continue;
    porPublicacion.set(f.publicacion_id as string, {
      id: f.id as string,
      tipo: f.tipo === "republicar" ? "republicar" : f.tipo === "apagar" ? "apagar" : "cambio",
      nuevoDropiId: f.nuevo_dropi_id === null || f.nuevo_dropi_id === undefined ? null : Number(f.nuevo_dropi_id),
      estado: f.estado as EstadoCambioDropi,
      nombre: (f.nombre as string | null) ?? null,
      nombreGuia: (f.nombre_guia as string | null) ?? null,
      precio: f.precio === null || f.precio === undefined ? null : Number(f.precio),
      precioSugerido: f.precio_sugerido === null || f.precio_sugerido === undefined ? null : Number(f.precio_sugerido),
      error: (f.error as string | null) ?? null,
      creadoEn: f.creado_en as string,
      aplicadoEn: (f.aplicado_en as string | null) ?? null,
    });
  }
  return { porPublicacion, pendientes };
}
