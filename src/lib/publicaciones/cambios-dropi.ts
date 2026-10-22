// La cola de cambios del sistema en Dropi (migración 0137): hoy, el nombre de un producto y el de su guía de envío, que deja «Usar
// este título» del Asistente de IA. Con una sesión de «Conectar Dropi» vigente se aplica al instante; sin ella queda pendiente y se
// aplica al conectar. Cada resultado queda en la actividad de la publicación a nombre de «Sistema».

import type { SupabaseClient } from "@supabase/supabase-js";
import { cambiarNombreEnDropi } from "@/lib/dropi/cliente-proveedor";
import { borrarSesionDropi, sesionVigenteDropi } from "@/lib/dropi/sesion";
import { idsDeDropi } from "./sincronizar-dropi";

export type EstadoCambioDropi = "pendiente" | "aplicado" | "error" | "reemplazado";

/** El último cambio en Dropi de una publicación, para la ficha. */
export interface CambioDropiVista {
  id: string;
  estado: EstadoCambioDropi;
  nombre: string;
  nombreGuia: string | null;
  error: string | null;
  creadoEn: string;
  aplicadoEn: string | null;
}

/**
 * Deja en la cola el cambio de nombre de una publicación (reemplaza el que estuviera pendiente de la misma). Necesita un ID de Dropi;
 * con dos («8165/7409») va al primero. Devuelve el id del cambio, o un error (sin ID o sin la migración 0137).
 */
export async function encolarCambioNombre(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: { nombre: string; nombreGuia: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("publicacion_id", pub.id).in("estado", ["pendiente", "error"]);
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, nombre: cambio.nombre, nombre_guia: cambio.nombreGuia, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: /does not exist|schema cache/i.test(error?.message ?? "") ? "Falta correr en Supabase la migración 0137." : "No se pudo dejar el cambio para Dropi." };
  return { id: data.id as string };
}

type Fila = { id: string; publicacion_id: string; dropi_producto_id: number; nombre: string; nombre_guia: string | null; intentos: number };

/**
 * Aplica en Dropi los cambios pendientes de un país (o solo `ids`), uno por uno, con la sesión vigente. Si la sesión venció a mitad
 * de camino, la borra y deja el resto pendiente. Devuelve cuántos se aplicaron, cuántos fallaron y si hay sesión.
 */
export async function aplicarCambiosDropi(
  supabase: SupabaseClient,
  pais: { id: string; codigo: string },
  ids?: string[],
): Promise<{ conSesion: boolean; aplicados: number; errores: number; pendientes: number; resultados: Map<string, { ok: boolean; error?: string }> }> {
  const resultados = new Map<string, { ok: boolean; error?: string }>();
  let q = supabase.from("dropi_cambios_pendientes").select("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, intentos").eq("pais_id", pais.id).order("creado_en").limit(50);
  q = ids?.length ? q.in("id", ids).in("estado", ["pendiente", "error"]) : q.eq("estado", "pendiente");
  const { data } = await q;
  const filas = (data ?? []) as Fila[];
  const sesion = await sesionVigenteDropi(supabase, pais.id);
  if (!sesion) return { conSesion: false, aplicados: 0, errores: 0, pendientes: filas.length, resultados };
  let aplicados = 0;
  let errores = 0;
  for (const [i, f] of filas.entries()) {
    const r = await cambiarNombreEnDropi(sesion.token, pais.codigo, sesion.usuarioId, Number(f.dropi_producto_id), { nombre: f.nombre, nombreGuia: f.nombre_guia });
    if (!r.ok && r.vencida) {
      // La sesión ya no sirve: se borra y lo que queda sigue pendiente (se aplica al volver a conectar).
      await borrarSesionDropi(supabase, pais.id);
      resultados.set(f.id, { ok: false, error: r.error });
      return { conSesion: false, aplicados, errores, pendientes: filas.length - i, resultados };
    }
    const ahora = new Date().toISOString();
    await supabase
      .from("dropi_cambios_pendientes")
      .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: f.intentos + 1 } : { estado: "error", error: r.error, intentos: f.intentos + 1 })
      .eq("id", f.id);
    await supabase.from("historial_auditoria").insert({
      usuario_id: null,
      usuario_nombre: "Sistema",
      accion: r.ok ? "dropi_nombre_aplicado" : "dropi_nombre_error",
      entidad: "dropi_publicaciones",
      entidad_id: f.publicacion_id,
      detalle: r.ok ? `ID ${f.dropi_producto_id} · «${f.nombre}»${f.nombre_guia ? ` · guía «${f.nombre_guia}»` : ""}` : `ID ${f.dropi_producto_id} · ${r.error}`,
    });
    resultados.set(f.id, r.ok ? { ok: true } : { ok: false, error: r.error });
    if (r.ok) aplicados++;
    else errores++;
  }
  return { conSesion: true, aplicados, errores, pendientes: 0, resultados };
}

/** El último cambio en Dropi de cada publicación del país y cuántos siguen pendientes. Sin la migración 0137, vacío. */
export async function cargarCambiosDropi(supabase: SupabaseClient, paisId: string): Promise<{ porPublicacion: Map<string, CambioDropiVista>; pendientes: number }> {
  const porPublicacion = new Map<string, CambioDropiVista>();
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, publicacion_id, estado, nombre, nombre_guia, error, creado_en, aplicado_en")
    .eq("pais_id", paisId)
    .neq("estado", "reemplazado")
    .order("creado_en", { ascending: false })
    .limit(2000);
  if (error) return { porPublicacion, pendientes: 0 };
  let pendientes = 0;
  for (const f of data ?? []) {
    if (f.estado === "pendiente") pendientes++;
    if (porPublicacion.has(f.publicacion_id as string)) continue;
    porPublicacion.set(f.publicacion_id as string, {
      id: f.id as string,
      estado: f.estado as EstadoCambioDropi,
      nombre: f.nombre as string,
      nombreGuia: (f.nombre_guia as string | null) ?? null,
      error: (f.error as string | null) ?? null,
      creadoEn: f.creado_en as string,
      aplicadoEn: (f.aplicado_en as string | null) ?? null,
    });
  }
  return { porPublicacion, pendientes };
}
