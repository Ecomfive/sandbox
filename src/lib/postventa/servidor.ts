// Cambios y reembolsos (migración 0972), del lado del servidor: aplicar un estado con sus automatizaciones (cambiar de grupo, Notificar al cliente,
// borrar los datos del reembolso al terminar, avisos en la campana), pasar a Hecho la solicitud cuando su reparto se entrega en Despacho ciudad y las
// reglas de cada mañana. Las decisiones son puras (`reglas.ts`); aquí solo se lee y se escribe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { efectosDeEstado, reglasDelDia, type Aviso } from "./reglas";
import { hoyPanama } from "./datos";

export interface Autor {
  id: string | null;
  nombre: string;
}

const HREF = "/despacho-cambios";

/** Un sello de edición: desde aquí la lectura de Monday no pisa la solicitud. */
export const selloCaso = (autor: Autor) => {
  const ahora = new Date().toISOString();
  return { editado_en: ahora, editado_por: autor.id, actualizado_monday: ahora };
};

export async function registrarCaso(supabase: SupabaseClient, itemId: string, autor: Autor, texto: string) {
  await supabase.from("postventa_actividad").insert({ item_id: itemId, texto: texto.slice(0, 500), autor_id: autor.id, autor_nombre: autor.nombre });
}

/** Los avisos a la campana: al responsable o a quien creó la solicitud (si no es quien hizo el cambio). */
export async function avisarCaso(supabase: SupabaseClient, fila: Record<string, unknown>, avisos: Aviso[], autor: Autor) {
  const filas = avisos
    .map((a) => ({ a, usuario: (a.a === "responsable" ? fila.responsable_id : fila.creado_por) as string | null }))
    .filter((x) => x.usuario && x.usuario !== autor.id)
    .map((x) => ({ usuario_id: x.usuario, tipo: "tarea", titulo: x.a.titulo.slice(0, 300), texto: x.a.texto.slice(0, 600), href: `${HREF}?caso=${fila.item_id}`, autor_id: autor.id, autor_nombre: autor.nombre }));
  if (filas.length) await supabase.from("notificaciones_usuario").insert(filas);
}

/** Cambia el Estado con las automatizaciones de Monday. `fila` es la fila completa de `mon_postventa`. */
export async function aplicarEstado(supabase: SupabaseClient, fila: Record<string, unknown>, nuevo: string | null, autor: Autor, extra: Record<string, unknown> = {}): Promise<{ error?: string; set?: Record<string, unknown> }> {
  const itemId = String(fila.item_id);
  const antes = (fila.estado as string | null) ?? null;
  if ((antes ?? "") === (nuevo ?? "")) return {};
  const efectos = nuevo
    ? efectosDeEstado({ nombre: String(fila.nombre ?? ""), tipos: (fila.tipos as string[] | null) ?? [], grupo: (fila.grupo as string | null) ?? null, seguimiento: fila.seguimiento as string | null }, nuevo, hoyPanama())
    : { set: { estado: null }, avisos: [], borrarCuenta: false };
  const set: Record<string, unknown> = { ...efectos.set, ...extra, ...selloCaso(autor) };
  const { error } = await supabase.from("mon_postventa").update(set).eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar." };
  if (efectos.borrarCuenta) await supabase.from("postventa_cuentas").delete().eq("item_id", itemId);
  await registrarCaso(supabase, itemId, autor, `Estado: ${antes ?? "vacío"} → ${nuevo ?? "vacío"}${set.grupo ? ` (pasa a ${set.grupo})` : ""}`);
  await avisarCaso(supabase, fila, efectos.avisos, autor);
  return { set };
}

/** Cuando el reparto de una solicitud se marca ENTREGADO en Despacho ciudad, la solicitud pasa a Hecho (con sus automatizaciones). */
export async function hechoDesdeDespacho(supabase: SupabaseClient, despachoItemId: string, autor: Autor): Promise<void> {
  const { data } = await supabase.from("mon_postventa").select("*").eq("despacho_item_id", despachoItemId).is("archivado_en", null);
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    if (fila.estado === "Hecho") continue;
    await aplicarEstado(supabase, fila, "Hecho", { ...autor, nombre: `${autor.nombre} (entregado en Despacho ciudad)` });
  }
}

/** Las reglas de cada mañana sobre las solicitudes de los últimos 60 días. Devuelve cuántas cambió. Sin la migración 0972, no hace nada. */
export async function correrReglasDelDia(supabase: SupabaseClient): Promise<number> {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("mon_postventa")
    .select("*")
    .is("archivado_en", null)
    .gte("creado_monday", desde)
    .or("estado.eq.Asignado,notificar.eq.Notificar");
  if (error || !data?.length) return 0;
  const filas = data as Record<string, unknown>[];
  const cambios = reglasDelDia(
    filas.map((f) => ({
      itemId: String(f.item_id),
      nombre: String(f.nombre ?? ""),
      tipos: (f.tipos as string[] | null) ?? [],
      estado: (f.estado as string | null) ?? null,
      fecha: (f.fecha as string | null) ?? null,
      notificar: (f.notificar as string | null) ?? null,
      fechaNotificacion: (f.fecha_notificacion as string | null) ?? null,
    })),
    hoyPanama(),
  );
  const autor: Autor = { id: null, nombre: "Regla diaria" };
  for (const c of cambios) {
    const fila = filas.find((f) => f.item_id === c.itemId)!;
    const { error: e } = await supabase.from("mon_postventa").update({ ...c.set, ...selloCaso(autor) }).eq("item_id", c.itemId);
    if (e) continue;
    await registrarCaso(supabase, c.itemId, autor, c.texto);
    await avisarCaso(supabase, fila, c.avisos, autor);
  }
  return cambios.length;
}
