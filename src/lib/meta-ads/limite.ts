// Anuncios Meta › el CPA tope de cada producto y qué tan lejos está de él algo (25 nov 2026, decidido por Alcides). Dos reglas que usa todo el módulo:
//
// 1. **El tope general ($10) se ajusta por producto** según cuánto se envía y se entrega: un producto que envía o entrega peor que la tienda tiene un tope más bajo, para que cada venta que llega no cueste más que la de un producto
//    promedio al tope general. Nunca sube el tope, y un tope escrito a mano en Cuentas se respeta tal cual.
// 2. **Dentro del tope no se toca.** Agregar videos, cambiar el presupuesto de golpe o la segmentación reinicia el aprendizaje de Meta y puede dañar una campaña que va bien: que el CPA suba de $5 a $7 no es motivo para tocarla.
//    Solo se propone cuando pasa del tope, o está cerca y ya no baja sola.
//
// Lógica pura, con prueba.

import { costoPorVenta, tasasDe, type CostosOperacion, type PedidosParaTasa, type Tasas } from "./costos-operacion";
import { CPA_TOPE_PREDETERMINADO, dolares } from "./metricas";

/** Desde esta parte del tope algo está «cerca del límite»: $9 con un tope de $10. */
export const CERCA_DEL_TOPE = 0.9;
/** Un ajuste menor que esto no vale la pena: el tope queda en el general. */
const AJUSTE_MINIMO = 0.25;
const TOPE_MINIMO = 0.5;

export interface TopeProducto {
  /** El CPA tope que se usa. */
  tope: number;
  /** El tope sin ajustar: el escrito a mano o el general. */
  base: number;
  /** Se escribió a mano en Cuentas. */
  definido: boolean;
  /** Se bajó por su envío y entrega. */
  ajustado: boolean;
  /** Sus porcentajes y los de la tienda, para explicar el ajuste. */
  envio: number | null;
  entrega: number | null;
  tiendaEnvio: number | null;
  tiendaEntrega: number | null;
}

/** El tope ajustado de un producto, o null si no hay que cambiar el general (sin datos propios, o envía y entrega igual o mejor que la tienda). */
export function topeAjustado(base: number, propias: Tasas, tienda: Tasas, c: CostosOperacion): number | null {
  if (propias.envio === null && propias.entrega === null) return null;
  const envio = propias.envio ?? tienda.envio;
  const entrega = propias.entrega ?? tienda.entrega;
  if (envio === null || entrega === null || envio <= 0 || entrega <= 0) return null;
  // Lo que cuesta cada venta entregada de un producto promedio de la tienda que compra justo al tope general.
  const referencia = costoPorVenta(base, tienda.envio, tienda.entrega, c);
  if (!referencia) return null;
  // El CPA de Meta con el que este producto llega a ese mismo costo.
  const envios = c.envio + c.cod * entrega + (1 - entrega) * c.envio;
  const tope = Math.round((referencia.total - envios - c.operativo) * envio * entrega * 10) / 10;
  return tope <= base - AJUSTE_MINIMO ? Math.max(TOPE_MINIMO, tope) : null;
}

/** El tope de un producto: el escrito a mano; si no, el general, ajustado por sus pedidos cuando envía o entrega peor que la tienda. */
export function topeDeProducto(manual: number | undefined, pedidos: PedidosParaTasa | null | undefined, tienda: Tasas, c: CostosOperacion): TopeProducto {
  const propias = tasasDe(pedidos);
  const datos = { envio: propias.envio, entrega: propias.entrega, tiendaEnvio: tienda.envio, tiendaEntrega: tienda.entrega };
  if (manual !== undefined) return { tope: manual, base: manual, definido: true, ajustado: false, ...datos };
  const ajustado = topeAjustado(CPA_TOPE_PREDETERMINADO, propias, tienda, c);
  return { tope: ajustado ?? CPA_TOPE_PREDETERMINADO, base: CPA_TOPE_PREDETERMINADO, definido: false, ajustado: ajustado !== null, ...datos };
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

/** Por qué un producto tiene ese tope, en una frase; null si es el general o el escrito a mano. */
export function textoDeTope(t: TopeProducto): string | null {
  if (!t.ajustado) return null;
  const suyo = [t.envio !== null ? `envía ${pct(t.envio)}` : "", t.entrega !== null ? `entrega ${pct(t.entrega)}` : ""].filter(Boolean).join(" y ");
  return `Tope ajustado a ${dolares(t.tope)} (el general es ${dolares(t.base)}): este producto ${suyo}, y la tienda envía ${pct(t.tiendaEnvio)} y entrega ${pct(t.tiendaEntrega)}.`;
}

export type Zona = "dentro" | "cerca" | "sobre";

/** Dónde está un CPA frente a su tope. */
export const zonaDeCpa = (costo: number, tope: number): Zona => (costo > tope ? "sobre" : costo >= tope * CERCA_DEL_TOPE ? "cerca" : "dentro");

/** La zona de unos resultados: sin compras, solo es un problema cuando ya se gastó una vez y media el tope. */
export function zonaDe(r: { gasto: number; compras: number }, tope: number): Zona {
  if (r.compras > 0) return zonaDeCpa(r.gasto / r.compras, tope);
  return r.gasto >= tope * 1.5 ? "sobre" : "dentro";
}

/** La frase que acompaña a todo lo que va dentro de su tope. */
export const NO_TOCAR = "No la toques: sigue dentro de su tope, y agregar videos o cambiar el presupuesto de golpe reinicia el aprendizaje de Meta.";
