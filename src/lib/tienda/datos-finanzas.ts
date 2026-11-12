// Gestión de tienda: lo que se lee de las órdenes de Finanzas (`ven_ordenes`, Portal AF4) para las tiendas que todavía no están conectadas a Shopify.
// Ver src/lib/tienda/ordenes-finanzas.ts. Solo lectura: nada de aquí escribe. Si las tablas de Finanzas no existen, no hay datos y las pantallas
// siguen como antes (vacías hasta conectar la tienda).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarPedidos, inicioPeriodo, type PedidoFila, type Tienda } from "./datos";
import { estadoDesdeFinanzas, momentoDeFecha, nombreComparable, zonaDeEtiquetas, type LineaFinanzas } from "./ordenes-finanzas";

/** De dónde salen los datos de las tiendas sin conectar: su unidad en Finanzas y hasta qué día llegan sus órdenes. */
export interface FuenteFinanzas {
  /** Tienda del sistema → su unidad en Finanzas (`fin_unidades`). Solo las que no están conectadas a Shopify. */
  unidadDe: Map<string, string>;
  /** El último día con órdenes (AAAA-MM-DD) de esas tiendas, o null si no tienen. */
  hasta: string | null;
  /** El archivo del que vienen (lo que dice `ven_ordenes.origen`). */
  origen: string | null;
}

const SIN_FUENTE: FuenteFinanzas = { unidadDe: new Map(), hasta: null, origen: null };

/** Las tiendas sin conectar que tienen órdenes en Finanzas: se emparejan por nombre (Kenku = KENKU) dentro del mismo país. */
export async function fuenteFinanzas(supabase: SupabaseClient, tiendas: Tienda[], codigoPais: string): Promise<FuenteFinanzas> {
  const sinConectar = tiendas.filter((t) => t.estado !== "conectada");
  if (!sinConectar.length) return SIN_FUENTE;
  const { data: unidades, error } = await supabase.from("fin_unidades").select("id, nombre").eq("pais", codigoPais).eq("clase", "tienda").eq("activo", true);
  if (error || !unidades?.length) return SIN_FUENTE;
  const porNombre = new Map(unidades.map((u) => [nombreComparable(u.nombre as string), u.id as string]));
  const unidadDe = new Map<string, string>();
  for (const t of sinConectar) {
    const u = porNombre.get(nombreComparable(t.nombre));
    if (u) unidadDe.set(t.id, u);
  }
  if (!unidadDe.size) return SIN_FUENTE;
  const { data: ultima } = await supabase
    .from("ven_ordenes")
    .select("fecha, origen")
    .in("unidad_id", [...unidadDe.values()])
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima) return SIN_FUENTE;
  return { unidadDe, hasta: ultima.fecha as string, origen: (ultima.origen as string | null) ?? null };
}

/** Las órdenes de Finanzas de esas tiendas entre `desde` y `hasta` (días AAAA-MM-DD), con sus unidades, como pedidos de la pantalla; y sus líneas. */
export async function cargarPedidosFinanzas(
  supabase: SupabaseClient,
  fuente: FuenteFinanzas,
  tiendaIds: string[],
  desde: string,
  hasta: string,
): Promise<{ pedidos: PedidoFila[]; lineas: LineaFinanzas[] }> {
  const tiendaDeUnidad = new Map<string, string>();
  for (const id of tiendaIds) {
    const u = fuente.unidadDe.get(id);
    if (u) tiendaDeUnidad.set(u, id);
  }
  if (!tiendaDeUnidad.size) return { pedidos: [], lineas: [] };
  const unidades = [...tiendaDeUnidad.keys()];
  const [ordenes, lineas] = await Promise.all([
    traerTodasLasFilas<{
      id: string;
      unidad_id: string;
      numero: string | null;
      fecha: string;
      estado_entrega: string | null;
      etiquetas: string | null;
      total: number | null;
      moneda: string | null;
      transportista: string | null;
      guia: string | null;
      ven_ordenes_clientes: { nombre: string | null; corregimiento: string | null } | { nombre: string | null; corregimiento: string | null }[] | null;
    }>((d, h) =>
      supabase
        .from("ven_ordenes")
        // El cliente está aparte, en `ven_ordenes_clientes` (lo trae el Excel y lo trae Shopify).
        .select("id, unidad_id, numero, fecha, estado_entrega, etiquetas, total, moneda, transportista, guia, ven_ordenes_clientes(nombre, corregimiento)")
        .in("unidad_id", unidades)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .order("id")
        .range(d, h),
    ).catch(() => []),
    cargarLineasFinanzas(supabase, unidades, desde, hasta),
  ]);
  const unidadesDe = new Map<string, number>();
  for (const l of lineas) if (!l.esServicio) unidadesDe.set(l.pedidoId, (unidadesDe.get(l.pedidoId) ?? 0) + l.cantidad);
  const clienteDe = (o: (typeof ordenes)[number]) => (Array.isArray(o.ven_ordenes_clientes) ? (o.ven_ordenes_clientes[0] ?? null) : o.ven_ordenes_clientes);
  const pedidos = ordenes.map((o) => ({
    id: o.id,
    tiendaId: tiendaDeUnidad.get(o.unidad_id) ?? "",
    numero: o.numero ?? "—",
    creado: momentoDeFecha(o.fecha),
    cliente: clienteDe(o)?.nombre ?? null,
    provincia: zonaDeEtiquetas(o.etiquetas),
    ciudad: clienteDe(o)?.corregimiento ?? null,
    moneda: o.moneda ?? "USD",
    total: Number(o.total) || 0,
    unidades: unidadesDe.get(o.id) ?? 0,
    estado: estadoDesdeFinanzas(o.estado_entrega, o.etiquetas),
    transportista: o.transportista,
    guia: o.guia,
  }));
  return { pedidos, lineas };
}

/** Las líneas de las órdenes de esas unidades entre esos días (por la fecha de su orden). */
export async function cargarLineasFinanzas(supabase: SupabaseClient, unidades: string[], desde: string, hasta: string): Promise<LineaFinanzas[]> {
  if (!unidades.length) return [];
  const filas = await traerTodasLasFilas<{ orden_id: string; linea: number; producto: string | null; cantidad: number | null; precio: number | null; sku_maestro_id: string | null; es_servicio: boolean | null }>((d, h) =>
    supabase
      .from("ven_orden_lineas")
      .select("orden_id, linea, producto, cantidad, precio, sku_maestro_id, es_servicio, ven_ordenes!inner(unidad_id, fecha)")
      .in("ven_ordenes.unidad_id", unidades)
      .gte("ven_ordenes.fecha", desde)
      .lte("ven_ordenes.fecha", hasta)
      .order("orden_id")
      .order("linea")
      .range(d, h),
  ).catch(() => []);
  return filas.map((l) => ({
    pedidoId: l.orden_id,
    titulo: l.producto ?? "(sin nombre)",
    skuId: l.sku_maestro_id,
    cantidad: Number(l.cantidad) || 0,
    precio: l.precio === null ? null : Number(l.precio),
    esServicio: l.es_servicio === true,
  }));
}

/**
 * Los pedidos de las tiendas que se miran, de Shopify (las conectadas) y de Finanzas (las demás), y el día desde el que cuentan los periodos: si todo
 * sale de Finanzas, el último día con órdenes (es una foto); si no, hoy. `dias` es cuántos días hacia atrás se traen (el doble para comparar).
 */
export async function pedidosDeTiendas(
  supabase: SupabaseClient,
  miradas: Tienda[],
  codigoPais: string,
  dias: number,
): Promise<{ pedidos: PedidoFila[]; lineasFinanzas: LineaFinanzas[]; fuente: FuenteFinanzas; referencia: Date }> {
  const fuente = await fuenteFinanzas(supabase, miradas, codigoPais);
  const soloFinanzas = miradas.length > 0 && miradas.every((t) => fuente.unidadDe.has(t.id));
  const referencia = soloFinanzas && fuente.hasta ? new Date(momentoDeFecha(fuente.hasta)) : new Date();
  const desde = inicioPeriodo(dias, referencia);
  const hasta = inicioPeriodo(1, referencia);
  const ids = miradas.map((t) => t.id);
  const [deShopify, deFinanzas] = await Promise.all([
    cargarPedidos(
      supabase,
      ids.filter((id) => !fuente.unidadDe.has(id)),
      desde,
    ),
    cargarPedidosFinanzas(supabase, fuente, ids, desde, hasta),
  ]);
  const pedidos = [...deShopify, ...deFinanzas.pedidos].sort((x, y) => y.creado.localeCompare(x.creado));
  return { pedidos, lineasFinanzas: deFinanzas.lineas, fuente, referencia };
}
