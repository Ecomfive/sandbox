// Anuncios Meta › el CPA tope de cada producto y qué tan lejos está de él algo (25 nov 2026, decidido por Alcides). Dos reglas que usa todo el módulo:
//
// 1. **El tope general ($10) se ajusta por producto, entre $9 y $10**, según cuánto se envía y se entrega: un producto que envía o entrega peor que la tienda tiene un tope un poco más bajo, tanto como menos ventas le lleguen. El precio
//    de cada producto ya contempla un CPA de $10, así que el ajuste es corto (para probar cómo funciona). Nunca sube el tope, y un tope escrito a mano en Cuentas se respeta tal cual.
// 2. **Dentro del tope no se toca.** Agregar videos, cambiar el presupuesto de golpe o la segmentación reinicia el aprendizaje de Meta y puede dañar una campaña que va bien: que el CPA suba de $5 a $7 no es motivo para tocarla.
//    Solo se propone cuando pasa del tope, o está cerca y ya no baja sola.
//
// Lógica pura, con prueba.

import { tasasDe, type PedidosParaTasa, type Tasas } from "./costos-operacion";
import { CPA_TOPE_PREDETERMINADO, dolares } from "./metricas";

/** Desde esta parte del tope algo está «cerca del límite»: $9 con un tope de $10. */
export const CERCA_DEL_TOPE = 0.9;
/** Lo más que puede bajar el tope por envío y entrega: de $10 a $9. */
export const AJUSTE_MAXIMO = 1;
/** El ajuste completo es para quien tiene esta parte menos de ventas entregadas que la tienda (o más); entre medio, en proporción. */
export const CAIDA_PARA_EL_MAXIMO = 0.25;
/** Un ajuste menor que esto no vale la pena: el tope queda en el general. */
const AJUSTE_MINIMO = 0.25;

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

/**
 * El tope ajustado de un producto, o null si no hay que cambiar el general (sin datos propios, o le llegan casi tantas ventas como a la tienda). Se compara cuántas compras terminan entregadas (envío × entrega) con las de la tienda:
 * con un 25 % menos o peor baja $1; con la mitad de esa caída, $0.50.
 */
export function topeAjustado(base: number, propias: Tasas, tienda: Tasas): number | null {
  if (propias.envio === null && propias.entrega === null) return null;
  const envio = propias.envio ?? tienda.envio;
  const entrega = propias.entrega ?? tienda.entrega;
  if (envio === null || entrega === null || !tienda.envio || !tienda.entrega) return null;
  const caida = 1 - (envio * entrega) / (tienda.envio * tienda.entrega);
  const ajuste = Math.min(AJUSTE_MAXIMO, (caida / CAIDA_PARA_EL_MAXIMO) * AJUSTE_MAXIMO);
  return ajuste < AJUSTE_MINIMO ? null : Math.round((base - ajuste) * 10) / 10;
}

/** El tope de un producto: el escrito a mano; si no, el general, ajustado por sus pedidos cuando envía o entrega peor que la tienda. */
export function topeDeProducto(manual: number | undefined, pedidos: PedidosParaTasa | null | undefined, tienda: Tasas): TopeProducto {
  const propias = tasasDe(pedidos);
  const datos = { envio: propias.envio, entrega: propias.entrega, tiendaEnvio: tienda.envio, tiendaEntrega: tienda.entrega };
  if (manual !== undefined) return { tope: manual, base: manual, definido: true, ajustado: false, ...datos };
  const ajustado = topeAjustado(CPA_TOPE_PREDETERMINADO, propias, tienda);
  return { tope: ajustado ?? CPA_TOPE_PREDETERMINADO, base: CPA_TOPE_PREDETERMINADO, definido: false, ajustado: ajustado !== null, ...datos };
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

/** Desde esta parte del tope algo se apaga si no baja: $12 con un tope de $10 (el CPA en rojo del documento «Métrica»). */
export const FACTOR_DE_APAGADO = 1.2;
const redondo = (n: number) => Math.round(n * 100) / 100;

/** Lo que hay que saber de un producto con el tope ajustado: por qué, desde qué CPA vigilarlo y desde cuál apagarlo (y cuáles serían con el tope general). */
export interface GuiaDeTope {
  tope: number;
  vigilar: number;
  apagar: number;
  vigilarGeneral: number;
  apagarGeneral: number;
  /** «Entrega más baja», «Envía menos» o «Envía y entrega menos». */
  causa: string;
  /** «entrega 70 % (la tienda 85 %)». */
  motivo: string;
}

export function guiaDeTope(t: TopeProducto): GuiaDeTope | null {
  if (!t.ajustado) return null;
  const menos = (propia: number | null, tienda: number | null) => propia !== null && tienda !== null && Math.round(propia * 100) < Math.round(tienda * 100);
  const envia = menos(t.envio, t.tiendaEnvio);
  const entrega = menos(t.entrega, t.tiendaEntrega);
  const motivo = [envia ? `envía ${pct(t.envio)} (la tienda ${pct(t.tiendaEnvio)})` : "", entrega ? `entrega ${pct(t.entrega)} (la tienda ${pct(t.tiendaEntrega)})` : ""].filter(Boolean).join(" y ");
  return {
    tope: t.tope,
    vigilar: redondo(t.tope * CERCA_DEL_TOPE),
    apagar: redondo(t.tope * FACTOR_DE_APAGADO),
    vigilarGeneral: redondo(t.base * CERCA_DEL_TOPE),
    apagarGeneral: redondo(t.base * FACTOR_DE_APAGADO),
    causa: envia && entrega ? "Envía y entrega menos" : envia ? "Envía menos" : "Entrega más baja",
    motivo: motivo || `envía ${pct(t.envio)} y entrega ${pct(t.entrega)}`,
  };
}

/** La indicación en una frase, para la IA y las listas de texto. */
export const textoDeGuia = (g: GuiaDeTope): string =>
  `${g.causa}: ${g.motivo}. Su tope es ${dolares(g.tope)}: conviene empezar a vigilarlo desde un CPA de ${dolares(g.vigilar)} y apagarlo desde ${dolares(g.apagar)} si en 4 días no baja (con el tope general sería ${dolares(g.vigilarGeneral)} y ${dolares(g.apagarGeneral)}).`;

export type EstadoDeGuia = "apagar" | "vigilar" | "bien" | "sin_compras";

/** Dónde está un producto frente a sus dos puntos, con unos resultados. */
export function estadoFrenteAGuia(r: { gasto: number; compras: number }, g: GuiaDeTope): EstadoDeGuia {
  if (r.compras <= 0) return r.gasto >= g.tope * 1.5 ? "apagar" : "sin_compras";
  const costo = r.gasto / r.compras;
  return costo >= g.apagar ? "apagar" : costo >= g.vigilar ? "vigilar" : "bien";
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
