/**
 * Productos de la cartera para el panel de Dirección (30 oct 2026, fase 3: vender más). Cruza lo que vende cada dropshipper (sus pedidos de
 * Dropi por producto, `crm_productos_por_dropshipper`, migración 0200) con el stock de cada producto en Dropi y lo que viene en camino
 * (Compras): qué se está acabando y a quién afecta, qué vende cada cliente y qué recomendarle. Lógica pura: se prueba en productos.test.ts.
 */

export interface VentaProducto {
  dropshipperId: string;
  productoId: number;
  producto: string;
  /** Pedidos de los últimos 30 días (sin cancelados). */
  pedidos: number;
}

/** Del resumen de ventas de Dropi (Desempeño › Ventas Dropi): stock y ritmo de venta del producto en el país. */
export interface StockProducto {
  stock: number;
  /** Unidades netas por día de los últimos 30 días. */
  porDia: number;
  /** Stock ÷ netas por día; null si no se vende. */
  diasInventario: number | null;
}

export interface CaminoProducto {
  unidades: number;
  /** La llegada más próxima (ISO); null si nada tiene fecha. */
  llegada: string | null;
}

export type EstadoStock = "agotado" | "se_acaba" | "reponer" | "ok" | "sin_dato";

export const ETIQUETA_ESTADO_STOCK: Record<EstadoStock, string> = { agotado: "Agotado", se_acaba: "Se acaba", reponer: "Reponer pronto", ok: "Con stock", sin_dato: "Sin dato de stock" };

/** Menos de 7 días: se acaba (alerta); menos de 15: reponer pronto (como Compras › Reponer). */
export const DIAS_SE_ACABA = 7;
export const DIAS_REPONER_PRONTO = 15;

export function estadoStock(s: StockProducto | undefined): EstadoStock {
  if (!s) return "sin_dato";
  if (s.stock <= 0) return s.porDia > 0 ? "agotado" : "ok";
  if (s.diasInventario === null) return "ok";
  return s.diasInventario < DIAS_SE_ACABA ? "se_acaba" : s.diasInventario < DIAS_REPONER_PRONTO ? "reponer" : "ok";
}

const ORDEN_ESTADO: Record<EstadoStock, number> = { agotado: 0, se_acaba: 1, reponer: 2, ok: 3, sin_dato: 4 };

export interface ProductoCartera {
  productoId: number;
  nombre: string;
  /** Cuántos dropshippers lo vendieron en 30 días. */
  dropshippers: number;
  pedidos: number;
  stock: number | null;
  diasInventario: number | null;
  estado: EstadoStock;
  camino: CaminoProducto | null;
  /** Quiénes lo venden, el que más primero. */
  clientes: { dropshipperId: string; pedidos: number }[];
}

/** Un producto por fila con quién lo vende, su stock y lo que viene: primero los que se acaban, y entre iguales el más pedido. */
export function productosDeCartera(ventas: VentaProducto[], stock: Map<number, StockProducto>, camino: Map<number, CaminoProducto>): ProductoCartera[] {
  const porProducto = new Map<number, VentaProducto[]>();
  for (const v of ventas) porProducto.set(v.productoId, [...(porProducto.get(v.productoId) ?? []), v]);
  return [...porProducto.entries()]
    .map(([productoId, vs]): ProductoCartera => {
      const s = stock.get(productoId);
      return {
        productoId,
        nombre: vs[0].producto,
        dropshippers: vs.length,
        pedidos: vs.reduce((t, v) => t + v.pedidos, 0),
        stock: s ? s.stock : null,
        diasInventario: s ? s.diasInventario : null,
        estado: estadoStock(s),
        camino: camino.get(productoId) ?? null,
        clientes: vs.map((v) => ({ dropshipperId: v.dropshipperId, pedidos: v.pedidos })).sort((a, b) => b.pedidos - a.pedidos),
      };
    })
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || b.pedidos - a.pedidos);
}

export interface LoQueVende {
  productoId: number;
  nombre: string;
  pedidos: number;
  /** Parte de sus pedidos de 30 días (0 a 1). */
  parte: number;
  estado: EstadoStock;
  diasInventario: number | null;
  camino: CaminoProducto | null;
}

export interface Recomendado {
  productoId: number;
  nombre: string;
  razon: string;
  stock: number | null;
}

/** Lo que vende un dropshipper (los `max` que más pide) y qué parte de sus pedidos es cada uno, con el estado del stock. */
export function loQueVende(dropshipperId: string, productos: ProductoCartera[], max = 5): LoQueVende[] {
  const suyos = productos
    .map((p) => ({ p, pedidos: p.clientes.find((c) => c.dropshipperId === dropshipperId)?.pedidos ?? 0 }))
    .filter((x) => x.pedidos > 0);
  const total = suyos.reduce((t, x) => t + x.pedidos, 0);
  return suyos
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, max)
    .map(({ p, pedidos }) => ({ productoId: p.productoId, nombre: p.nombre, pedidos, parte: total ? pedidos / total : 0, estado: p.estado, diasInventario: p.diasInventario, camino: p.camino }));
}

/**
 * Qué recomendarle: productos que él no vende, con stock para 15 días o más (o sin dato de ritmo), que venden otros. Primero los que venden
 * los dropshippers parecidos (los que venden alguno de sus mismos productos) y, si no alcanzan, los más vendidos de la cartera.
 */
export function recomendados(dropshipperId: string, productos: ProductoCartera[], max = 3): Recomendado[] {
  const suyos = new Set(productos.filter((p) => p.clientes.some((c) => c.dropshipperId === dropshipperId)).map((p) => p.productoId));
  const parecidos = new Set<string>();
  for (const p of productos) if (suyos.has(p.productoId)) for (const c of p.clientes) if (c.dropshipperId !== dropshipperId) parecidos.add(c.dropshipperId);
  const candidatos = productos
    .filter((p) => !suyos.has(p.productoId) && p.estado === "ok" && (p.stock ?? 0) > 0 && p.dropshippers >= 2)
    .map((p) => ({ p, deParecidos: p.clientes.filter((c) => parecidos.has(c.dropshipperId)).length }));
  return candidatos
    .sort((a, b) => b.deParecidos - a.deParecidos || b.p.dropshippers - a.p.dropshippers || b.p.pedidos - a.p.pedidos)
    .slice(0, max)
    .map(({ p, deParecidos }) => ({
      productoId: p.productoId,
      nombre: p.nombre,
      stock: p.stock,
      razon:
        deParecidos >= 2
          ? `Lo venden ${deParecidos} dropshippers que venden lo mismo que él (${p.pedidos} pedidos en 30 días)`
          : `Lo venden ${p.dropshippers} dropshippers (${p.pedidos} pedidos en 30 días)`,
    }));
}
