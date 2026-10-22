import type { SupabaseClient } from "@supabase/supabase-js";
import { precioEquivalente } from "@/lib/competencia/analisis";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

export interface CompetidorBarato {
  proveedor: string;
  /** Su precio llevado al tamaño del nuestro (`precioEquivalente`). */
  precio: number;
}

/**
 * Los competidores de cada producto nuestro en Dropi (Análisis de competencia, migración 0108), por el ID de Dropi de nuestro
 * producto: los que lo venden igual (por nombre o foto), siguen publicados y tienen stock. Sin la tabla o sin búsquedas, vacío.
 */
export async function cargarCompetidores(supabase: SupabaseClient, paisId: string): Promise<Map<number, { nombre: string; proveedor: string; precio: number | null }[]>> {
  const out = new Map<number, { nombre: string; proveedor: string; precio: number | null }[]>();
  try {
    const [nuestros, otros] = await Promise.all([
      traerTodasLasFilas<{ id: string; dropi_producto_id: number }>((d, h) => supabase.from("competencia_productos").select("id, dropi_producto_id").eq("pais_id", paisId).eq("es_nuestro", true).order("id").range(d, h)),
      traerTodasLasFilas<{ igual_a: string; nombre: string; proveedor_nombre: string; precio: number | null }>((d, h) =>
        supabase
          .from("competencia_productos")
          .select("igual_a, nombre, proveedor_nombre, precio")
          .eq("pais_id", paisId)
          .eq("es_nuestro", false)
          .eq("estado", "activo")
          .gt("stock", 0)
          .not("igual_a", "is", null)
          .order("id")
          .range(d, h),
      ),
    ]);
    const dropiDe = new Map(nuestros.map((n) => [n.id, Number(n.dropi_producto_id)]));
    for (const o of otros) {
      const dropiId = dropiDe.get(o.igual_a);
      if (dropiId === undefined) continue;
      out.set(dropiId, [...(out.get(dropiId) ?? []), { nombre: o.nombre, proveedor: o.proveedor_nombre, precio: o.precio === null ? null : Number(o.precio) }]);
    }
  } catch {
    // Sin la migración 0108: sin competencia.
  }
  return out;
}

/** El competidor más barato que nosotros (a precio equivalente), o null si nadie vende lo mismo más barato. */
export function competidorMasBarato(
  nuestro: { nombre: string; precio: number | null; idsDropi: number[] },
  competidores: Map<number, { nombre: string; proveedor: string; precio: number | null }[]>,
): CompetidorBarato | null {
  if (nuestro.precio === null) return null;
  let mejor: CompetidorBarato | null = null;
  for (const id of nuestro.idsDropi)
    for (const c of competidores.get(id) ?? []) {
      const eq = precioEquivalente(nuestro.nombre, c).precio;
      if (eq !== null && eq < nuestro.precio && (!mejor || eq < mejor.precio)) mejor = { proveedor: c.proveedor, precio: eq };
    }
  return mejor;
}

/** El precio equivalente más bajo de la competencia con stock (aunque sea más caro que el nuestro), o null sin competencia. */
export function competidorMinimo(
  nuestro: { nombre: string; idsDropi: number[] },
  competidores: Map<number, { nombre: string; proveedor: string; precio: number | null }[]>,
): CompetidorBarato | null {
  let mejor: CompetidorBarato | null = null;
  for (const id of nuestro.idsDropi)
    for (const c of competidores.get(id) ?? []) {
      const eq = precioEquivalente(nuestro.nombre, c).precio;
      if (eq !== null && eq > 0 && (!mejor || eq < mejor.precio)) mejor = { proveedor: c.proveedor, precio: eq };
    }
  return mejor;
}

export interface NuestroEnDropi {
  nombre: string;
  precio: number | null;
  precioSugerido: number | null;
  categoria: string | null;
  /** null = todavía no se leyó (migración 0129 y la lectura siguiente). */
  fotos: number | null;
  videos: number | null;
  descripcionLargo: number | null;
}

/**
 * Cómo se ven nuestros productos en el catálogo de Dropi (la última lectura de Análisis de competencia), por su ID de Dropi: el
 * título, el precio y el sugerido y, desde la migración 0129, las fotos, los videos y el largo de la descripción. Sin la tabla, vacío.
 */
export async function cargarNuestrosEnDropi(supabase: SupabaseClient, paisId: string): Promise<Map<number, NuestroEnDropi>> {
  const out = new Map<number, NuestroEnDropi>();
  type F = { dropi_producto_id: number; nombre: string; precio: number | null; precio_sugerido: number | null; categoria: string | null; fotos?: number | null; videos?: number | null; descripcion_largo?: number | null };
  const leer = (columnas: string) =>
    traerTodasLasFilas<F>((d, h) => supabase.from("competencia_productos").select(columnas as "*").eq("pais_id", paisId).eq("es_nuestro", true).eq("estado", "activo").order("id").range(d, h) as unknown as PromiseLike<{ data: F[] | null; error: unknown }>);
  const base = "dropi_producto_id, nombre, precio, precio_sugerido, categoria";
  let filas: F[] = [];
  try {
    filas = await leer(`${base}, fotos, videos, descripcion_largo`);
  } catch {
    try {
      filas = await leer(base);
    } catch {
      return out;
    }
  }
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  for (const f of filas)
    out.set(Number(f.dropi_producto_id), {
      nombre: f.nombre,
      precio: n(f.precio),
      precioSugerido: n(f.precio_sugerido),
      categoria: f.categoria,
      fotos: n(f.fotos),
      videos: n(f.videos),
      descripcionLargo: n(f.descripcion_largo),
    });
  return out;
}

export interface CambioPrecio {
  /** Cuándo se vio el cambio en Dropi (la lectura del catálogo que lo encontró, no el minuto exacto). */
  fecha: string;
  antes: number | null;
  despues: number | null;
}

/**
 * El último cambio de precio de cada producto nuestro en Dropi, por su ID de Dropi, y desde cuándo se lee el catálogo del país
 * (Análisis de competencia guarda un evento «precio» cada vez que una lectura encuentra otro precio). Así «Último cambio de
 * precio» ya no se anota a mano. Sin la tabla o sin lecturas, vacío.
 */
export async function cargarCambiosPrecio(supabase: SupabaseClient, paisId: string): Promise<{ cambios: Map<number, CambioPrecio>; desde: string | null }> {
  const cambios = new Map<number, CambioPrecio>();
  try {
    const [nuestros, primera] = await Promise.all([
      traerTodasLasFilas<{ id: string; dropi_producto_id: number }>((d, h) => supabase.from("competencia_productos").select("id, dropi_producto_id").eq("pais_id", paisId).eq("es_nuestro", true).order("id").range(d, h)),
      supabase.from("competencia_busquedas").select("inicio").eq("pais_id", paisId).order("inicio").limit(1).maybeSingle(),
    ]);
    const dropiDe = new Map(nuestros.map((n) => [n.id, Number(n.dropi_producto_id)]));
    const ids = [...dropiDe.keys()];
    // De a 150 ids por consulta: la lista va en la dirección del pedido.
    const tandas = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) =>
        traerTodasLasFilas<{ producto_id: string; fecha: string; precio: number | null; precio_antes: number | null }>((d, h) =>
          supabase.from("competencia_historial").select("producto_id, fecha, precio, precio_antes").eq("evento", "precio").in("producto_id", ids.slice(i * 150, (i + 1) * 150)).order("fecha", { ascending: false }).range(d, h),
        ),
      ),
    );
    for (const e of tandas.flat()) {
      const dropiId = dropiDe.get(e.producto_id);
      if (dropiId === undefined) continue;
      const actual = cambios.get(dropiId);
      if (!actual || e.fecha > actual.fecha)
        cambios.set(dropiId, { fecha: e.fecha, antes: e.precio_antes === null ? null : Number(e.precio_antes), despues: e.precio === null ? null : Number(e.precio) });
    }
    return { cambios, desde: (primera.data?.inicio as string | undefined) ?? null };
  } catch {
    return { cambios, desde: null };
  }
}

/** El cambio más reciente entre los IDs de Dropi de una publicación («7231-7679» son dos). */
export function ultimoCambioDe(idsDropi: number[], cambios: Map<number, CambioPrecio>): CambioPrecio | null {
  let ultimo: CambioPrecio | null = null;
  for (const id of idsDropi) {
    const c = cambios.get(id);
    if (c && (!ultimo || c.fecha > ultimo.fecha)) ultimo = c;
  }
  return ultimo;
}
