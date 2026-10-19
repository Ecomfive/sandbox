// Lo comprado por categoría de producto (pedido de Alcides, 19 oct 2026): unidades, valor y compras de cada categoría en un
// periodo. La categoría sale de los productos vinculados a cada compra (taxonomía de Shopify, agrupada con `grupoReporte`).
// Una compra con varios productos reparte su valor según las unidades de cada uno. Lógica pura, con prueba.
import { grupoReporte } from "../categorias/taxonomia";
import { mesesDelPeriodo, type Periodo } from "./unidades-mes";

export const SIN_PRODUCTOS = "Sin productos vinculados";
export const SIN_CATEGORIA = "Sin categoría";

export interface CompraCategoria {
  id: string;
  creadoEn: string;
  etapa: string;
  qtyTotal: number | null;
  montoTotal: number | null;
  anulada?: unknown;
  lineas: { cantidad: number; categoria?: string | null }[];
}

export interface FilaCategoria {
  categoria: string;
  unidades: number;
  valor: number;
  compras: number;
}

/** Cada compra que cuenta, repartida en sus categorías: [categoría, unidades, valor]. */
export function partesDeCompra(c: CompraCategoria): [string, number, number][] {
  const monto = c.montoTotal ?? 0;
  if (!c.lineas.length) return [[SIN_PRODUCTOS, c.qtyTotal ?? 0, monto]];
  const total = c.lineas.reduce((s, l) => s + (l.cantidad || 0), 0);
  return c.lineas.map((l) => [grupoReporte(l.categoria) ?? SIN_CATEGORIA, l.cantidad || 0, total ? (monto * (l.cantidad || 0)) / total : monto / c.lineas.length]);
}

/** Las categorías compradas en el periodo (por el mes en que se creó la compra), de la que más unidades tiene a la que menos. */
export function comprasPorCategoria(compras: CompraCategoria[], periodo: Periodo | "todo", hoy: string): FilaCategoria[] {
  const meses = periodo === "todo" ? null : new Set(mesesDelPeriodo(periodo, hoy));
  const m = new Map<string, { unidades: number; valor: number; compras: Set<string> }>();
  for (const c of compras) {
    if (c.anulada || c.etapa === "descartado") continue;
    if (meses && !meses.has(c.creadoEn.slice(0, 7))) continue;
    for (const [cat, u, v] of partesDeCompra(c)) {
      const f = m.get(cat) ?? { unidades: 0, valor: 0, compras: new Set<string>() };
      f.unidades += u;
      f.valor += v;
      f.compras.add(c.id);
      m.set(cat, f);
    }
  }
  return [...m]
    .map(([categoria, f]) => ({ categoria, unidades: f.unidades, valor: Math.round(f.valor * 100) / 100, compras: f.compras.size }))
    .sort((a, b) => b.unidades - a.unidades);
}
