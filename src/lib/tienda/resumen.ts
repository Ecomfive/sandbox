// Gestión de tienda (3 nov 2026): las cuentas de los paneles de las tiendas de Shopify (tablero de Pedidos, Dashboard y Productos vendidos). Sin base
// ni React, para poder probarlo. Los pedidos llegan de Shopify (etapa 2, solo lectura); aquí solo se cuentan.

export type EstadoPedido = "nuevo" | "confirmado" | "en_camino" | "entregado" | "cancelado" | "devuelto";

/** Los estados en el orden del recorrido de un pedido, con su nombre y el tono de su insignia. */
export const ESTADOS_PEDIDO: { id: EstadoPedido; etiqueta: string; tono: "aviso" | "neutro" | "exito" | "peligro" }[] = [
  { id: "nuevo", etiqueta: "Por confirmar", tono: "aviso" },
  { id: "confirmado", etiqueta: "Confirmado", tono: "neutro" },
  { id: "en_camino", etiqueta: "En camino", tono: "neutro" },
  { id: "entregado", etiqueta: "Entregado", tono: "exito" },
  { id: "cancelado", etiqueta: "Cancelado", tono: "peligro" },
  { id: "devuelto", etiqueta: "Devuelto", tono: "peligro" },
];

export const esEstadoPedido = (v: unknown): v is EstadoPedido => ESTADOS_PEDIDO.some((e) => e.id === v);

export interface PedidoResumen {
  estado: EstadoPedido;
  total: number;
  /** La fecha del pedido en Shopify (ISO). */
  creado: string;
  unidades: number;
}

export interface Resumen {
  pedidos: number;
  porEstado: Record<EstadoPedido, number>;
  /** Confirmados: todo lo que pasó la confirmación (confirmado, en camino, entregado o devuelto). */
  confirmados: number;
  /** Porcentajes sobre los pedidos (null sin pedidos); la entrega, sobre lo que salió (en camino, entregado o devuelto). */
  confirmacion: number | null;
  entrega: number | null;
  cancelacion: number | null;
  devolucion: number | null;
  unidadesPorPedido: number | null;
  facturado: number;
  /** Contra entrega: lo entregado se cobró, lo que va en camino está por cobrar y lo devuelto no se cobró. */
  recaudado: number;
  porRecaudar: number;
  devueltoMonto: number;
  ticketPromedio: number | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const dinero = (n: number) => Math.round(n * 100) / 100;

/** Las cuentas de un grupo de pedidos (los de la tienda y el periodo elegidos). */
export function resumirPedidos(pedidos: PedidoResumen[]): Resumen {
  const porEstado = Object.fromEntries(ESTADOS_PEDIDO.map((e) => [e.id, 0])) as Record<EstadoPedido, number>;
  let facturado = 0;
  let recaudado = 0;
  let porRecaudar = 0;
  let devueltoMonto = 0;
  let unidades = 0;
  for (const p of pedidos) {
    porEstado[p.estado]++;
    unidades += p.unidades;
    if (p.estado !== "cancelado") facturado += p.total;
    if (p.estado === "entregado") recaudado += p.total;
    if (p.estado === "en_camino") porRecaudar += p.total;
    if (p.estado === "devuelto") devueltoMonto += p.total;
  }
  const n = pedidos.length;
  const confirmados = porEstado.confirmado + porEstado.en_camino + porEstado.entregado + porEstado.devuelto;
  const salieron = porEstado.en_camino + porEstado.entregado + porEstado.devuelto;
  const noCancelados = n - porEstado.cancelado;
  return {
    pedidos: n,
    porEstado,
    confirmados,
    confirmacion: pct(confirmados, n),
    entrega: pct(porEstado.entregado, salieron),
    cancelacion: pct(porEstado.cancelado, n),
    devolucion: pct(porEstado.devuelto, n),
    unidadesPorPedido: n ? Math.round((unidades / n) * 100) / 100 : null,
    facturado: dinero(facturado),
    recaudado: dinero(recaudado),
    porRecaudar: dinero(porRecaudar),
    devueltoMonto: dinero(devueltoMonto),
    ticketPromedio: noCancelados ? dinero(facturado / noCancelados) : null,
  };
}

/** La fecha (AAAA-MM-DD) de un momento en la hora de Panamá: así un pedido de las 9 p. m. no cae en el día siguiente. */
export const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Cuántos pedidos hubo cada día, de `desde` a `hasta` (AAAA-MM-DD, los dos incluidos), con los días sin pedidos en 0. */
export function pedidosPorDia(pedidos: { creado: string }[], desde: string, hasta: string): { dia: string; pedidos: number }[] {
  const cuenta = new Map<string, number>();
  for (const p of pedidos) {
    const d = diaPanama(p.creado);
    cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  const dias: { dia: string; pedidos: number }[] = [];
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${hasta}T12:00:00Z`) && dias.length < 400; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    dias.push({ dia: d, pedidos: cuenta.get(d) ?? 0 });
  }
  return dias;
}

export interface LineaVendida {
  shopifyVarianteId: number | null;
  titulo: string;
  cantidad: number;
  precio: number;
  /** El estado de su pedido: lo cancelado no cuenta como vendido. */
  estado: EstadoPedido;
  pedidoId: string;
}

export interface Vendido {
  /** El producto nuestro, o null para lo que todavía no se vinculó. */
  skuId: string | null;
  unidades: number;
  pedidos: number;
  ingreso: number;
  /** Del ingreso de todo lo vendido. */
  porcentaje: number | null;
}

/**
 * Lo vendido por producto nuestro, cruzando las líneas de los pedidos con la vinculación de cada variante (`vinculos`: variante de Shopify → producto,
 * o `no_fisico` para lo que no sale de bodega, que no se cuenta). Lo que no tiene vínculo va junto, con `skuId` null. De más a menos ingreso.
 */
export function productosVendidos(lineas: LineaVendida[], vinculos: Map<number, string | "no_fisico">): Vendido[] {
  const grupos = new Map<string, { skuId: string | null; unidades: number; pedidos: Set<string>; ingreso: number }>();
  let total = 0;
  for (const l of lineas) {
    if (l.estado === "cancelado") continue;
    const v = l.shopifyVarianteId === null ? undefined : vinculos.get(l.shopifyVarianteId);
    if (v === "no_fisico") continue;
    const clave = v ?? "";
    const g = grupos.get(clave) ?? { skuId: v ?? null, unidades: 0, pedidos: new Set<string>(), ingreso: 0 };
    g.unidades += l.cantidad;
    g.pedidos.add(l.pedidoId);
    g.ingreso += l.cantidad * l.precio;
    total += l.cantidad * l.precio;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ skuId: g.skuId, unidades: g.unidades, pedidos: g.pedidos.size, ingreso: dinero(g.ingreso), porcentaje: pct(g.ingreso, total) }))
    .sort((a, b) => b.ingreso - a.ingreso);
}
