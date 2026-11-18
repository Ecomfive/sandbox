// Gestión de tienda › Pedidos › «Todas las tiendas» (18 nov 2026, pedido de Hernán): al hacer clic en la tarjeta de una tienda se despliega debajo lo que
// sirve para decidir: cuántos pedidos se entregaron (y si lo dice Monday, Servientrega o nadie), cuántos se confirmaron, y lo mismo por producto, para ver
// cuál rinde mejor y cuál peor. Aquí solo las cuentas, sin base ni React, con prueba (`detalle-tienda.test.ts`). Los estados salen tal cual del sistema:
// la entrega solo la marcan Monday o Servientrega (nada se deduce), la confirmación sale de Shopify y de la confirmación del sistema.

import type { EstadoPedido } from "./resumen";

export interface PedidoDetalle {
  id: string;
  estado: EstadoPedido;
}

/** Una línea de un pedido ya con su producto: `clave` agrupa (el producto nuestro o, sin vincular, el nombre de Shopify). */
export interface LineaDetalle {
  pedidoId: string;
  clave: string;
  nombre: string;
  /** Vinculado a un producto nuestro. */
  vinculado: boolean;
  cantidad: number;
}

export interface Conteo {
  pedidos: number;
  porConfirmar: number;
  /** Todo lo que pasó la confirmación (confirmado, en camino, entregado o devuelto). */
  confirmados: number;
  enCamino: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  /** Sobre los pedidos. */
  confirmacion: number | null;
  /** Sobre lo que salió (en camino, entregado o devuelto). */
  entrega: number | null;
}

export interface FilaProducto extends Conteo {
  clave: string;
  nombre: string;
  vinculado: boolean;
  /** Unidades de los pedidos no cancelados. */
  unidades: number;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Cuántos pedidos hay en cada paso, con los porcentajes. */
export function contar(estados: EstadoPedido[]): Conteo {
  const c = { nuevo: 0, confirmado: 0, en_camino: 0, entregado: 0, cancelado: 0, devuelto: 0 } satisfies Record<EstadoPedido, number>;
  for (const e of estados) c[e]++;
  const confirmados = c.confirmado + c.en_camino + c.entregado + c.devuelto;
  const salieron = c.en_camino + c.entregado + c.devuelto;
  return {
    pedidos: estados.length,
    porConfirmar: c.nuevo,
    confirmados,
    enCamino: c.en_camino,
    entregados: c.entregado,
    devueltos: c.devuelto,
    cancelados: c.cancelado,
    confirmacion: pct(confirmados, estados.length),
    entrega: pct(c.entregado, salieron),
  };
}

/** Lo mismo por producto: cada pedido cuenta una vez por producto aunque lo lleve en varias líneas. De más a menos pedidos. */
export function porProducto(pedidos: PedidoDetalle[], lineas: LineaDetalle[]): FilaProducto[] {
  const estadoDe = new Map(pedidos.map((p) => [p.id, p.estado]));
  const grupos = new Map<string, { nombre: string; vinculado: boolean; pedidos: Map<string, EstadoPedido>; unidades: number }>();
  for (const l of lineas) {
    const estado = estadoDe.get(l.pedidoId);
    if (!estado) continue;
    const g = grupos.get(l.clave) ?? { nombre: l.nombre, vinculado: l.vinculado, pedidos: new Map(), unidades: 0 };
    g.pedidos.set(l.pedidoId, estado);
    if (estado !== "cancelado") g.unidades += l.cantidad;
    grupos.set(l.clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, nombre: g.nombre, vinculado: g.vinculado, unidades: g.unidades, ...contar([...g.pedidos.values()]) }))
    .sort((a, b) => b.pedidos - a.pedidos || a.nombre.localeCompare(b.nombre, "es"));
}

export type FuenteEntrega = "monday" | "servientrega" | "sin_registro";

/** De dónde sale cada entregado: Servientrega (la guía dice entregado), Monday (el despacho dice entregado) o ninguno de los dos (marcado antes, o del Excel). */
export function origenEntregas(entregados: string[], monday: Map<string, string>, guias: Map<string, string>): Record<FuenteEntrega, number> {
  const r: Record<FuenteEntrega, number> = { monday: 0, servientrega: 0, sin_registro: 0 };
  for (const id of entregados) {
    if (guias.get(id) === "entregado") r.servientrega++;
    else if (monday.get(id) === "entregado") r.monday++;
    else r.sin_registro++;
  }
  return r;
}

/** Lo mínimo para medir un producto: con menos, cualquier porcentaje sale raro. */
export const MINIMO_PRODUCTO = 10;

export interface Extremos {
  mejorEntrega: FilaProducto | null;
  peorEntrega: FilaProducto | null;
  mejorConfirmacion: FilaProducto | null;
  peorConfirmacion: FilaProducto | null;
}

/** El que mejor y el que peor rinde, solo entre los que tienen al menos `minimo` pedidos (confirmación) o `minimo` salidos (entrega). */
export function extremos(filas: FilaProducto[], minimo = MINIMO_PRODUCTO): Extremos {
  const conEntrega = filas.filter((f) => f.entrega !== null && f.enCamino + f.entregados + f.devueltos >= minimo);
  const conConfirmacion = filas.filter((f) => f.confirmacion !== null && f.pedidos >= minimo);
  const mejor = (xs: FilaProducto[], k: "entrega" | "confirmacion") => xs.reduce<FilaProducto | null>((m, f) => (m === null || (f[k] ?? 0) > (m[k] ?? 0) ? f : m), null);
  const peor = (xs: FilaProducto[], k: "entrega" | "confirmacion") => xs.reduce<FilaProducto | null>((m, f) => (m === null || (f[k] ?? 0) < (m[k] ?? 0) ? f : m), null);
  const dos = <T,>(a: T | null, b: T | null) => (a !== null && a === b ? null : b);
  const me = mejor(conEntrega, "entrega");
  const mc = mejor(conConfirmacion, "confirmacion");
  // Con un solo producto medible no hay «peor»: sería el mismo.
  return { mejorEntrega: me, peorEntrega: dos(me, peor(conEntrega, "entrega")), mejorConfirmacion: mc, peorConfirmacion: dos(mc, peor(conConfirmacion, "confirmacion")) };
}
