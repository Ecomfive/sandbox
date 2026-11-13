// «Republicar (B280)» (12 nov 2026, proceso de Nicol; tarea de Alcides): el ID viejo tiene su stock en la bodega de Dropi (B280 en Panamá, B15 en Costa Rica),
// que nosotros no podemos mover. «Aplicar en Dropi» crea el ID nuevo con 100 unidades temporales en nuestra bodega y lo deja en 0; después hay que pedirle a
// Dropi, por mensaje en el grupo, que traslade a mano las unidades de su bodega del ID viejo al nuevo, y el viejo se archiva un mes después (devoluciones tardías).
// Aquí: lo que viaja en `datos` del cambio, el mensaje para Dropi y el cierre solo de la tarea «Pedir a Dropi el traslado» cuando la lectura de «Mis productos»
// ve el stock en la bodega de Dropi del ID nuevo. Importa con rutas relativas porque también corre desde `scripts/` (la lectura diaria).

import type { SupabaseClient } from "@supabase/supabase-js";
import { esBodegaDropi } from "./automatico";

/** Lo que guarda `datos` de un cambio «republicar» de la B280. */
export interface DatosRepublicar {
  b280: true;
  /** Unidades temporales con que se crea el ID nuevo (Dropi no deja publicar con 0). */
  temporal: number;
  /** Las unidades que el ID viejo tenía en la bodega de Dropi al republicar (las que Dropi debe trasladar). */
  unidadesB280: number | null;
  /** La tarea «Pedir a Dropi el traslado» (se cierra sola al ver el traslado). */
  trasladoTarea: string | null;
  /** Cuándo la lectura vio el stock en la bodega de Dropi del ID nuevo. */
  trasladado: string | null;
}

/** `datos` de un cambio «republicar» de la B280, revisado; null si es una republicación de siempre. */
export function normalizarDatosRepublicar(v: unknown): DatosRepublicar | null {
  const d = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  if (!d || d.b280 !== true) return null;
  const entero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);
  const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 100) : null);
  return { b280: true, temporal: entero(d.temporal) || 100, unidadesB280: entero(d.unidadesB280), trasladoTarea: texto(d.trasladoTarea), trasladado: texto(d.trasladado) };
}

/** Las unidades en la bodega de Dropi (B280 o B15) de una lectura de «Mis productos». */
export function unidadesEnBodegaDropi(bodegas: unknown): number {
  return (Array.isArray(bodegas) ? (bodegas as { id?: unknown; stock?: unknown }[]) : [])
    .filter((b) => esBodegaDropi(Number(b.id)))
    .reduce((t, b) => t + Math.max(0, Number(b.stock) || 0), 0);
}

/** El nombre de la bodega de Dropi del país, para el mensaje. */
export const bodegaDropiDePais = (codigo: string) => (codigo.toUpperCase() === "CR" ? "la bodega de Dropi Costa Rica (B15)" : "la Bodega Dropi Panamá (B280)");

/** El mensaje para el grupo de Dropi, listo para copiar. */
export function mensajeTrasladoDropi(m: { viejo: number | string; nuevo: number | string; nombre: string; unidades: number | null; pais: string }): string {
  const cuantas = m.unidades && m.unidades > 0 ? `las ${m.unidades.toLocaleString("es-PA")} unidades` : "todas las unidades";
  return `Hola equipo Dropi 👋 Por favor trasladar ${cuantas} de ${bodegaDropiDePais(m.pais)} del ID ${m.viejo} al ID nuevo ${m.nuevo} («${m.nombre}»). Republicamos el producto y el ID ${m.viejo} se archiva más adelante. ¡Gracias!`;
}

/**
 * Cierra las tareas «Pedir a Dropi el traslado» de un país cuando la última lectura de «Mis productos» ya ve stock en la bodega de Dropi del ID nuevo: la tarea queda
 * hecha (por «Sistema») y el cambio anota `trasladado`. Lo llama `guardarNuestrosProductos` después de guardar la lectura; un fallo no tumba la lectura.
 */
export async function cerrarTrasladosB280(supabase: SupabaseClient, paisId: string): Promise<{ cerrados: number }> {
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, datos, nuevo_dropi_id, nueva_publicacion_id")
    .eq("pais_id", paisId)
    .eq("tipo", "republicar")
    .eq("estado", "aplicado")
    .eq("datos->>b280", "true")
    .is("datos->>trasladado", null);
  if (error || !data?.length) return { cerrados: 0 };
  let cerrados = 0;
  for (const f of data) {
    const d = normalizarDatosRepublicar(f.datos);
    const nuevo = Number(f.nuevo_dropi_id);
    if (!d || !nuevo) continue;
    const { data: lectura } = await supabase.from("dropi_productos_proveedor").select("bodegas").eq("pais_id", paisId).eq("dropi_producto_id", nuevo).maybeSingle();
    const unidades = unidadesEnBodegaDropi(lectura?.bodegas);
    if (unidades <= 0) continue;
    const ahora = new Date().toISOString();
    if (d.trasladoTarea)
      await supabase
        .from("dropi_publicaciones_tareas")
        .update({ estado: "hecha", hecha_en: ahora, hecha_por_nombre: "Sistema", hecha_nota: `Dropi ya trasladó: el ID ${nuevo} tiene ${unidades.toLocaleString("es-PA")} u. en su bodega (lectura de «Mis productos»).` })
        .eq("id", d.trasladoTarea)
        .is("hecha_en", null);
    await supabase
      .from("dropi_cambios_pendientes")
      .update({ datos: { ...(f.datos as Record<string, unknown>), trasladado: ahora } })
      .eq("id", f.id as string);
    cerrados++;
  }
  return { cerrados };
}
