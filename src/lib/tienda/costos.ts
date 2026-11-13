// El costo de cada producto para los pedidos de tienda (12 nov 2026, «Ingresos y costos» como en Mi Reto Digital). **Es el costo promedio de
// compra del producto** (pedido de Alcides, 12 nov 2026), el mismo «Costo promedio» del bloque Compras de su ficha en Producto: lo invertido ÷ las
// unidades compradas, contando solo las compras que suman (`compraCuenta`: ni descartadas ni anuladas) y con costo; un producto con variantes
// suma las de sus variantes. Se toman las compras del país del pedido y, si en ese país no hay, las de todos los países; siempre se dice cuál.
// Ya no se usa el costo de Gestión de IDs Dropi. Solo lectura.

import type { SupabaseClient } from "@supabase/supabase-js";
import { compraCuenta } from "@/lib/compras/cuenta";

export type FuenteCosto = "promedio_pais" | "promedio_todos";
export interface CostoProducto {
  costo: number;
  fuente: FuenteCosto;
}

export const NOMBRE_FUENTE_COSTO: Record<FuenteCosto, string> = {
  promedio_pais: "costo promedio de compra del país",
  promedio_todos: "costo promedio de compra (todos los países)",
};

/** Una línea de compra, para el promedio. */
export interface CompraParaCosto {
  unidades: number;
  costoUnitario: number | null;
  paisId: string | null;
  etapa: string;
  anulada: boolean;
}

/**
 * El costo promedio de compra (lo invertido ÷ las unidades con costo), como en la ficha del producto: del país si hay compras con costo allí,
 * si no de todos los países; null si ninguna compra que suma tiene costo. Sin base: con prueba.
 */
export function costoPromedioDeCompras(compras: CompraParaCosto[], paisId: string): CostoProducto | null {
  const conCosto = compras.filter((c) => compraCuenta(c) && c.costoUnitario !== null && c.costoUnitario > 0 && c.unidades > 0);
  const promedio = (cs: CompraParaCosto[]) => {
    const unidades = cs.reduce((t, c) => t + c.unidades, 0);
    const total = cs.reduce((t, c) => t + c.unidades * (c.costoUnitario ?? 0), 0);
    return unidades > 0 ? Math.round((total / unidades) * 10000) / 10000 : null;
  };
  const delPais = promedio(conCosto.filter((c) => c.paisId === paisId));
  if (delPais !== null) return { costo: delPais, fuente: "promedio_pais" };
  const todos = promedio(conCosto);
  return todos === null ? null : { costo: todos, fuente: "promedio_todos" };
}

/** El costo por unidad de esos productos para un pedido del país `paisId` (por su id de `skus_maestros`). Los que no tienen ninguno no salen. */
export async function costosDeProductos(supabase: SupabaseClient, skuIds: string[], paisId: string): Promise<Map<string, CostoProducto>> {
  const ids = [...new Set(skuIds.filter(Boolean))];
  const mapa = new Map<string, CostoProducto>();
  if (!ids.length) return mapa;
  for (let i = 0; i < ids.length; i += 150) {
    const parte = ids.slice(i, i + 150);
    // Un producto con variantes suma las compras de sus variantes (como su ficha).
    const { data: hijos } = await supabase.from("skus_maestros").select("id, padre_id").in("padre_id", parte);
    const hijosDe = new Map<string, string[]>();
    for (const h of (hijos ?? []) as { id: string; padre_id: string }[]) hijosDe.set(h.padre_id, [...(hijosDe.get(h.padre_id) ?? []), h.id]);
    const todos = [...new Set([...parte, ...[...hijosDe.values()].flat()])];
    const deSku = new Map<string, CompraParaCosto[]>();
    for (let j = 0; j < todos.length; j += 200) {
      const { data } = await supabase
        .from("wms_compra_items")
        .select("sku_maestro_id, cantidad_pedida, costo_unitario, wms_compras!inner(pais_id, etapa, anulada_en)")
        .in("sku_maestro_id", todos.slice(j, j + 200));
      for (const l of (data ?? []) as unknown as { sku_maestro_id: string; cantidad_pedida: number | null; costo_unitario: number | null; wms_compras: unknown }[]) {
        const c = (Array.isArray(l.wms_compras) ? l.wms_compras[0] : l.wms_compras) as { pais_id: string | null; etapa: string; anulada_en: string | null } | null;
        if (!c) continue;
        const fila: CompraParaCosto = {
          unidades: Number(l.cantidad_pedida) || 0,
          costoUnitario: l.costo_unitario === null ? null : Number(l.costo_unitario),
          paisId: c.pais_id,
          etapa: c.etapa,
          anulada: !!c.anulada_en,
        };
        deSku.set(l.sku_maestro_id, [...(deSku.get(l.sku_maestro_id) ?? []), fila]);
      }
    }
    for (const id of parte) {
      const costo = costoPromedioDeCompras([id, ...(hijosDe.get(id) ?? [])].flatMap((s) => deSku.get(s) ?? []), paisId);
      if (costo) mapa.set(id, costo);
    }
  }
  return mapa;
}

export interface IngresosYCostos {
  venta: number;
  /** El costo de los productos (cantidad × costo por unidad) de las líneas que se pudieron costear. */
  costoProductos: number;
  /** Líneas de producto sin producto nuestro o sin costo: el costo está incompleto. */
  lineasSinCosto: number;
  /** De dónde salieron los costos usados. */
  fuentes: FuenteCosto[];
  fulfillment: number | null;
  flete: number | null;
  /** Venta − costo − fulfillment − flete (lo que se sabe); null si no se pudo costear nada. */
  margen: number | null;
  /** Margen ÷ venta, en %. */
  margenPct: number | null;
}

/** Las cuentas de «Ingresos y costos» de un pedido. Sin base: con prueba. */
export function cuentasDelPedido(
  venta: number,
  lineas: { skuId: string | null; cantidad: number; esServicio: boolean }[],
  costos: Map<string, CostoProducto>,
  fulfillment: number | null,
  flete: number | null,
): IngresosYCostos {
  let costoProductos = 0;
  let lineasSinCosto = 0;
  const fuentes = new Set<FuenteCosto>();
  for (const l of lineas) {
    if (l.esServicio) continue;
    const c = l.skuId ? costos.get(l.skuId) : undefined;
    if (!c) {
      lineasSinCosto++;
      continue;
    }
    costoProductos += c.costo * l.cantidad;
    fuentes.add(c.fuente);
  }
  const conCosto = lineas.some((l) => !l.esServicio && l.skuId && costos.has(l.skuId));
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const margen = conCosto ? redondear(venta - costoProductos - (fulfillment ?? 0) - (flete ?? 0)) : null;
  return {
    venta: redondear(venta),
    costoProductos: redondear(costoProductos),
    lineasSinCosto,
    fuentes: [...fuentes],
    fulfillment,
    flete,
    margen,
    margenPct: margen !== null && venta > 0 ? Math.round((margen / venta) * 1000) / 10 : null,
  };
}
