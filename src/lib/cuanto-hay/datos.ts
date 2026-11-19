// «¿Cuánto hay?» (16 nov 2026, migración 0302): lo que leen las dos pantallas. La tienda (Gestión de tienda › Preguntar cuánto hay)
// ve sus preguntas; Yiletsi (Despacho › Responder cuánto hay) ve las de todas las tiendas, agrupadas. Reglas puras: `reglas.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";
import { PROVEEDURIA, type PreguntaCuantoHay } from "./reglas";

export interface TiendaCuantoHay {
  id: string;
  nombre: string;
  /** La tienda de finanzas (`fin_unidades`) que le corresponde: es lo que guardan las tiendas asignadas de una persona. */
  unidadId: string | null;
}

/** Las tiendas creadas en el sistema, en su orden, con su tienda de finanzas. */
export async function cargarTiendasCuantoHay(supabase: SupabaseClient): Promise<TiendaCuantoHay[]> {
  const [{ data: tiendas }, { data: unidades }] = await Promise.all([
    supabase.from("tiendas").select("id, nombre, orden").order("orden", { ascending: true, nullsFirst: false }).order("nombre"),
    supabase.from("fin_unidades").select("id, nombre").eq("clase", "tienda"),
  ]);
  const us = (unidades ?? []) as { id: string; nombre: string }[];
  return ((tiendas ?? []) as { id: string; nombre: string }[]).map((t) => ({ id: t.id, nombre: t.nombre, unidadId: us.find((u) => mismaTiendaUnidad(t.nombre, u.nombre))?.id ?? null }));
}

const COLUMNAS = "id, tienda_id, producto, nota, pedido_por, pedido_por_nombre, creado_en, cantidad, respondido_por_nombre, respondido_en";

type Fila = {
  id: string;
  tienda_id: string | null;
  producto: string;
  nota: string | null;
  pedido_por: string;
  pedido_por_nombre: string | null;
  creado_en: string;
  cantidad: number | null;
  respondido_por_nombre: string | null;
  respondido_en: string | null;
};

const aPregunta = (f: Fila, tiendas: TiendaCuantoHay[]): PreguntaCuantoHay => ({
  id: f.id,
  tiendaId: f.tienda_id ?? PROVEEDURIA.id,
  tienda: f.tienda_id ? (tiendas.find((t) => t.id === f.tienda_id)?.nombre ?? "Tienda") : PROVEEDURIA.nombre,
  producto: f.producto,
  nota: f.nota,
  pedidoPor: f.pedido_por,
  pedidoPorNombre: f.pedido_por_nombre,
  creadoEn: f.creado_en,
  cantidad: f.cantidad,
  respondidoPorNombre: f.respondido_por_nombre,
  respondidoEn: f.respondido_en,
});

/** Si falta la migración 0302, `faltaMigracion`. */
type Resultado = { preguntas: PreguntaCuantoHay[]; faltaMigracion: boolean };

/**
 * Las preguntas que ve quien pregunta (los últimos 60 días): **solo las suyas** (19 nov 2026, pedido de Hernán: «salir solo lo que pregunta al que
 * pregunta»; antes, con tiendas asignadas, veía también las de sus compañeros).
 */
export async function cargarPreguntasDeTienda(supabase: SupabaseClient, usuarioId: string, tiendas: TiendaCuantoHay[]): Promise<Resultado> {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("tienda_cuanto_hay")
    .select(COLUMNAS)
    .gte("creado_en", desde)
    .eq("pedido_por", usuarioId)
    .order("creado_en", { ascending: false })
    .limit(300);
  if (error) return { preguntas: [], faltaMigracion: true };
  return { preguntas: ((data ?? []) as Fila[]).map((f) => aPregunta(f, tiendas)), faltaMigracion: false };
}

/** Lo que ve Yiletsi: las abiertas (todas) o las respondidas de los últimos 7 días. */
export async function cargarPreguntasDespacho(supabase: SupabaseClient, respondidas: boolean, tiendas: TiendaCuantoHay[]): Promise<Resultado> {
  const q = supabase.from("tienda_cuanto_hay").select(COLUMNAS);
  const { data, error } = respondidas
    ? await q.not("respondido_en", "is", null).gte("respondido_en", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("respondido_en", { ascending: false }).limit(500)
    : await q.is("respondido_en", null).order("creado_en").limit(500);
  if (error) return { preguntas: [], faltaMigracion: true };
  return { preguntas: ((data ?? []) as Fila[]).map((f) => aPregunta(f, tiendas)), faltaMigracion: false };
}

/** Cuántas preguntas siguen sin respuesta, por tienda (para los botones de arriba del panel de Yiletsi). */
export async function contarAbiertas(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("tienda_cuanto_hay").select("tienda_id").is("respondido_en", null).limit(2000);
  if (error) return {};
  const c: Record<string, number> = {};
  for (const f of (data ?? []) as { tienda_id: string | null }[]) {
    const k = f.tienda_id ?? PROVEEDURIA.id;
    c[k] = (c[k] ?? 0) + 1;
  }
  return c;
}
