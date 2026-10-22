// Portal del proveedor: las dos cuotas de cada pedido enviado y en qué estado están. Lógica pura.
//
// Acordado con Chin (21 oct 2026): el anticipo es el 50 % del total y vence 10 días corridos después de la fecha de envío (enviado
// el 21 oct, vence el 31 oct); el saldo es el otro 50 % y vence el día que llega. El porcentaje y los días salen de `proveedores`.

import { diasEntre, sumarDias } from "./fechas";

export type TipoCuota = "anticipo" | "saldo";
export type TonoCuota = "exito" | "aviso" | "peligro" | "info" | "neutro";

export interface Cuota {
  cuota: TipoCuota;
  monto: number;
  /** null: el saldo de lo que todavía no llega (vence a la llegada). */
  vence: string | null;
  pagado: number;
  fechaPago: string | null;
  /** Lo que falta pagar (nunca negativo). */
  pendiente: number;
}

/** Qué dice el estado, para escribirlo en el idioma de quien lo ve (`textos.ts`); `n` son los días. */
export type ClaveEstadoCuota = "pagado" | "pagado_a_tiempo" | "pagado_tarde" | "al_llegar" | "vencido" | "vence_hoy" | "vence_en";

export interface EstadoCuota {
  tono: TonoCuota;
  texto: string;
  clave: ClaveEstadoCuota;
  n: number;
  /** Días de atraso (pagada tarde o vencida); 0 si va a tiempo. */
  atraso: number;
}

/** Margen para dar por pagada una cuota (redondeos de centavos). */
const TOLERANCIA = 0.5;

/** Un pago recibido de una cuota (`proveedor_pagos`: confirmado por el proveedor o de su hoja de pagos). */
export interface Pago {
  monto: number;
  fecha: string;
}

export interface BaseCuotas {
  montoTotal: number | null;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  /** Cuando el anticipo no es el porcentaje de siempre (un envío por UPS se paga completo por adelantado). */
  anticipoMonto?: number | null;
  pagosAnticipo: Pago[];
  pagosSaldo: Pago[];
}

/** Las cuotas de un pedido; vacío si todavía no se envió o no tiene total. Si el anticipo es el total, no hay saldo. */
export function cuotasDe(b: BaseCuotas, porcentajeAnticipo = 50, diasAnticipo = 10): Cuota[] {
  if (!b.fechaEnvio || !b.montoTotal || b.montoTotal <= 0) return [];
  const anticipo = redondear(Math.min(b.montoTotal, b.anticipoMonto ?? (b.montoTotal * porcentajeAnticipo) / 100));
  const saldo = redondear(b.montoTotal - anticipo);
  const cuota = (tipo: TipoCuota, monto: number, vence: string | null, pagos: Pago[]): Cuota => {
    const pagado = redondear(pagos.reduce((s, x) => s + x.monto, 0));
    return {
      cuota: tipo,
      monto,
      vence,
      pagado,
      // La fecha del último pago: la cuota queda pagada cuando se completa.
      fechaPago: pagos.length ? pagos.map((x) => x.fecha).sort().at(-1)! : null,
      pendiente: Math.max(0, redondear(monto - pagado)),
    };
  };
  const cuotas = [cuota("anticipo", anticipo, sumarDias(b.fechaEnvio, diasAnticipo), b.pagosAnticipo)];
  if (saldo > 0) cuotas.push(cuota("saldo", saldo, b.fechaLlegada, b.pagosSaldo));
  return cuotas;
}

/** Días promedio entre la llegada y el pago del saldo, y cuántos se pagaron dentro de `dias` días. */
export function saldoTrasLlegada(cuotas: Cuota[], dias = 7) {
  const medibles = cuotas.filter((c) => c.cuota === "saldo" && estaPagada(c) && c.vence && c.fechaPago);
  const atrasos = medibles.map((c) => diasEntre(c.vence!, c.fechaPago!));
  return {
    total: medibles.length,
    promedio: atrasos.length ? Math.round((atrasos.reduce((s, d) => s + d, 0) / atrasos.length) * 10) / 10 : 0,
    dentro: atrasos.filter((d) => d <= dias).length,
  };
}

export const estaPagada = (c: Pick<Cuota, "pendiente">) => c.pendiente <= TOLERANCIA;

/** En qué va una cuota hoy: pagada a tiempo o tarde, vence en N días, vence hoy, vencida, o (el saldo) se paga al llegar. */
export function estadoCuota(c: Cuota, hoy: string): EstadoCuota {
  if (estaPagada(c)) {
    if (!c.vence || !c.fechaPago) return { tono: "exito", texto: "Pagado", atraso: 0, clave: "pagado", n: 0 };
    const tarde = diasEntre(c.vence, c.fechaPago);
    return tarde > 0 ? { tono: "aviso", texto: `Pagado ${tarde} d tarde`, atraso: tarde, clave: "pagado_tarde", n: tarde } : { tono: "exito", texto: "Pagado a tiempo", atraso: 0, clave: "pagado_a_tiempo", n: 0 };
  }
  if (!c.vence) return { tono: "neutro", texto: "Al llegar", atraso: 0, clave: "al_llegar", n: 0 };
  const faltan = diasEntre(hoy, c.vence);
  if (faltan < 0) return { tono: "peligro", texto: `Vencido ${-faltan} d`, atraso: -faltan, clave: "vencido", n: -faltan };
  if (faltan === 0) return { tono: "aviso", texto: "Vence hoy", atraso: 0, clave: "vence_hoy", n: 0 };
  return { tono: faltan <= 3 ? "aviso" : "info", texto: `Vence en ${faltan} d`, atraso: 0, clave: "vence_en", n: faltan };
}

/** Cumplimiento de un grupo de cuotas ya pagadas que tienen fecha de pago: cuántas a tiempo, atraso promedio y el peor. */
export function cumplimiento(cuotas: Cuota[]) {
  const medibles = cuotas.filter((c) => estaPagada(c) && c.vence && c.fechaPago);
  const atrasos = medibles.map((c) => Math.max(0, diasEntre(c.vence!, c.fechaPago!)));
  const tarde = atrasos.filter((d) => d > 0);
  return {
    total: medibles.length,
    aTiempo: atrasos.length - tarde.length,
    atrasoPromedio: tarde.length ? Math.round((tarde.reduce((s, d) => s + d, 0) / tarde.length) * 10) / 10 : 0,
    peor: atrasos.length ? Math.max(...atrasos) : 0,
  };
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}
