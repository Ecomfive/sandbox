import type { SupabaseClient } from "@supabase/supabase-js";
import { precioEquivalente, unidadesBajadas, type CambioStock } from "@/lib/competencia/analisis";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

export interface CompetidorBarato {
  proveedor: string;
  /** Su precio llevado al tamaño del nuestro (`precioEquivalente`). */
  precio: number;
}

/** Un competidor que vende lo mismo que un producto nuestro en Dropi, con su stock y lo que vendió (lo que bajó su stock) en 30 días. */
export interface CompetidorDePublicacion {
  nombre: string;
  proveedor: string;
  precio: number | null;
  stock: number;
  /** Unidades que bajó su stock en los últimos 30 días (`unidadesBajadas`): Dropi no muestra las ventas de otros. */
  vendido30: number;
}

/**
 * Los competidores de cada producto nuestro en Dropi (Análisis de competencia, migración 0108), por el ID de Dropi de nuestro
 * producto: los que lo venden igual (por nombre o foto), siguen publicados y tienen stock, con lo que vendieron en 30 días (28 oct 2026:
 * para decidir si igualar o bajar el precio). Sin la tabla o sin búsquedas, vacío.
 */
export async function cargarCompetidores(supabase: SupabaseClient, paisId: string): Promise<Map<number, CompetidorDePublicacion[]>> {
  const out = new Map<number, CompetidorDePublicacion[]>();
  try {
    const [nuestros, otros] = await Promise.all([
      traerTodasLasFilas<{ id: string; dropi_producto_id: number }>((d, h) => supabase.from("competencia_productos").select("id, dropi_producto_id").eq("pais_id", paisId).eq("es_nuestro", true).order("id").range(d, h)),
      traerTodasLasFilas<{ id: string; igual_a: string; nombre: string; proveedor_nombre: string; precio: number | null; stock: number | null }>((d, h) =>
        supabase
          .from("competencia_productos")
          .select("id, igual_a, nombre, proveedor_nombre, precio, stock")
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
    const deNuestros = otros.filter((o) => dropiDe.has(o.igual_a));
    const vendido = await vendidoEn30Dias(
      supabase,
      deNuestros.map((o) => o.id),
    );
    for (const o of deNuestros) {
      const dropiId = dropiDe.get(o.igual_a)!;
      out.set(dropiId, [
        ...(out.get(dropiId) ?? []),
        { nombre: o.nombre, proveedor: o.proveedor_nombre, precio: o.precio === null ? null : Number(o.precio), stock: Number(o.stock ?? 0), vendido30: vendido.get(o.id) ?? 0 },
      ]);
    }
  } catch {
    // Sin la migración 0108: sin competencia.
  }
  return out;
}

/** Lo que bajó el stock de cada producto de la competencia en los últimos 30 días (`competencia_historial`, de a 150 productos). */
async function vendidoEn30Dias(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const cambios = new Map<string, CambioStock[]>();
  const desde = new Date(Date.now() - 31 * 86_400_000).toISOString();
  for (let i = 0; i < ids.length; i += 150) {
    const parte = ids.slice(i, i + 150);
    const filas = await traerTodasLasFilas<{ id: string; producto_id: string; fecha: string; stock: number | null; stock_antes: number | null }>((d, h) =>
      supabase.from("competencia_historial").select("id, producto_id, fecha, stock, stock_antes").in("producto_id", parte).eq("evento", "stock").gte("fecha", desde).order("id").range(d, h),
    );
    for (const f of filas) {
      if (f.stock === null || f.stock_antes === null) continue;
      cambios.set(f.producto_id, [...(cambios.get(f.producto_id) ?? []), { fecha: f.fecha, stock: Number(f.stock), stockAntes: Number(f.stock_antes) }]);
    }
  }
  return new Map([...cambios].map(([id, c]) => [id, unidadesBajadas(c, 30)]));
}

/** Los competidores de un producto nuestro con su precio llevado al tamaño del nuestro, del más barato al más caro (para la recomendación de precio). */
export function competidoresEquivalentes(
  nuestro: { nombre: string; idsDropi: number[] },
  competidores: Map<number, CompetidorDePublicacion[]>,
): { proveedor: string; nombre: string; precio: number; stock: number; vendido30: number }[] {
  const out: { proveedor: string; nombre: string; precio: number; stock: number; vendido30: number }[] = [];
  for (const id of nuestro.idsDropi)
    for (const c of competidores.get(id) ?? []) {
      const eq = precioEquivalente(nuestro.nombre, c).precio;
      if (eq !== null && eq > 0) out.push({ proveedor: c.proveedor, nombre: c.nombre, precio: Math.round(eq * 100) / 100, stock: c.stock, vendido30: c.vendido30 });
    }
  return out.sort((a, b) => a.precio - b.precio);
}

/** El competidor más barato que nosotros (a precio equivalente), o null si nadie vende lo mismo más barato. */
export function competidorMasBarato(
  nuestro: { nombre: string; precio: number | null; idsDropi: number[] },
  competidores: Map<number, CompetidorDePublicacion[]>,
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
  competidores: Map<number, CompetidorDePublicacion[]>,
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
