// «¿Cuánto hay?» (16 nov 2026, migración 0302): lo que leen las dos pantallas. La tienda (Gestión de tienda › Preguntar cuánto hay)
// ve sus preguntas; Yiletsi (Despacho › Responder cuánto hay) ve las de todas las tiendas, agrupadas. Reglas puras: `reglas.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";
import { BUCKET_FOTOS_CUANTO_HAY, leerTipo, PROVEEDURIA, type FotoCuantoHay, type PreguntaCuantoHay } from "./reglas";

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
/** Con la migración 0342, además qué se pidió y de qué país. */
const COLUMNAS_CON_TIPO = `${COLUMNAS}, tipo, pais_id`;

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
  tipo?: string | null;
  pais_id?: string | null;
};

const aPregunta = (f: Fila, tiendas: TiendaCuantoHay[], paises: Map<string, string>, fotos: Map<string, FotoCuantoHay[]>): PreguntaCuantoHay => ({
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
  tipo: leerTipo(f.tipo),
  pais: f.pais_id ? (paises.get(f.pais_id) ?? null) : null,
  fotos: fotos.get(f.id) ?? [],
});

type Consulta = (columnas: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>;

/** Lee las filas con las columnas de la 0342 y, si todavía no está, con las de antes. `error` solo si no se pudo ni así. */
async function leerFilas(consulta: Consulta): Promise<{ filas: Fila[]; error: boolean }> {
  let r = await consulta(COLUMNAS_CON_TIPO);
  if (r.error) r = await consulta(COLUMNAS);
  return { filas: (r.data ?? []) as Fila[], error: !!r.error };
}

/** Las preguntas armadas: con el nombre del país y las fotos (con su enlace firmado de una hora) de las que pidieron fotos. */
async function armar(supabase: SupabaseClient, filas: Fila[], tiendas: TiendaCuantoHay[]): Promise<PreguntaCuantoHay[]> {
  const paises = new Map<string, string>();
  const fotos = new Map<string, FotoCuantoHay[]>();
  const ids = filas.filter((f) => f.tipo === "fotos").map((f) => f.id);
  if (ids.length) {
    const idsPais = [...new Set(filas.map((f) => f.pais_id).filter((x): x is string => !!x))];
    const [{ data: ps }, { data: fs }] = await Promise.all([
      idsPais.length ? supabase.from("paises").select("id, nombre").in("id", idsPais) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      supabase.from("tienda_cuanto_hay_fotos").select("id, pregunta_id, ruta").in("pregunta_id", ids).order("subido_en"),
    ]);
    for (const p of (ps ?? []) as { id: string; nombre: string }[]) paises.set(p.id, p.nombre);
    const filasFoto = (fs ?? []) as { id: string; pregunta_id: string; ruta: string }[];
    if (filasFoto.length) {
      const { data: firmadas } = await supabase.storage.from(BUCKET_FOTOS_CUANTO_HAY).createSignedUrls(filasFoto.map((x) => x.ruta), 3600);
      const urlDe = new Map((firmadas ?? []).map((x) => [x.path, x.signedUrl] as const));
      for (const x of filasFoto) {
        const url = urlDe.get(x.ruta);
        if (url) fotos.set(x.pregunta_id, [...(fotos.get(x.pregunta_id) ?? []), { id: x.id, url }]);
      }
    }
  }
  return filas.map((f) => aPregunta(f, tiendas, paises, fotos));
}

/** Si falta la migración 0302, `faltaMigracion`. */
type Resultado = { preguntas: PreguntaCuantoHay[]; faltaMigracion: boolean };

/**
 * Las preguntas que ve quien pregunta (los últimos 60 días): **solo las suyas** (19 nov 2026, pedido de Hernán: «salir solo lo que pregunta al que
 * pregunta»; antes, con tiendas asignadas, veía también las de sus compañeros).
 */
export async function cargarPreguntasDeTienda(supabase: SupabaseClient, usuarioId: string, tiendas: TiendaCuantoHay[]): Promise<Resultado> {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { filas, error } = await leerFilas((c) => supabase.from("tienda_cuanto_hay").select(c).gte("creado_en", desde).eq("pedido_por", usuarioId).order("creado_en", { ascending: false }).limit(300));
  if (error) return { preguntas: [], faltaMigracion: true };
  return { preguntas: await armar(supabase, filas, tiendas), faltaMigracion: false };
}

/** Lo que ve Yiletsi: las abiertas (todas) o las respondidas de los últimos 7 días. */
export async function cargarPreguntasDespacho(supabase: SupabaseClient, respondidas: boolean, tiendas: TiendaCuantoHay[]): Promise<Resultado> {
  const { filas, error } = await leerFilas((c) => {
    const q = supabase.from("tienda_cuanto_hay").select(c);
    return respondidas ? q.not("respondido_en", "is", null).gte("respondido_en", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("respondido_en", { ascending: false }).limit(500) : q.is("respondido_en", null).order("creado_en").limit(500);
  });
  if (error) return { preguntas: [], faltaMigracion: true };
  return { preguntas: await armar(supabase, filas, tiendas), faltaMigracion: false };
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
