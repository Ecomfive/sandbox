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

export interface EstadoCuota {
  tono: TonoCuota;
  texto: string;
  /** Días de atraso (pagada tarde o vencida); 0 si va a tiempo. */
  atraso: number;
}

/** Margen para dar por pagada una cuota (redondeos de centavos). */
const TOLERANCIA = 0.5;

export interface PedidoParaCuotas {
  montoTotal: number | null;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  primerPago: number | null;
  fechaPago1: string | null;
  segundoPago: number | null;
  fechaPago2: string | null;
}

/** Las cuotas de un pedido; vacío si todavía no se envió o no tiene total. */
export function cuotasDe(p: PedidoParaCuotas, porcentajeAnticipo = 50, diasAnticipo = 10): Cuota[] {
  if (!p.fechaEnvio || !p.montoTotal || p.montoTotal <= 0) return [];
  const anticipo = redondear((p.montoTotal * porcentajeAnticipo) / 100);
  const saldo = redondear(p.montoTotal - anticipo);
  const cuota = (tipo: TipoCuota, monto: number, vence: string | null, pagado: number | null, fecha: string | null): Cuota => ({
    cuota: tipo,
    monto,
    vence,
    pagado: pagado ?? 0,
    fechaPago: fecha,
    pendiente: Math.max(0, redondear(monto - (pagado ?? 0))),
  });
  return [
    cuota("anticipo", anticipo, sumarDias(p.fechaEnvio, diasAnticipo), p.primerPago, p.fechaPago1),
    cuota("saldo", saldo, p.fechaLlegada, p.segundoPago, p.fechaPago2),
  ];
}

export const estaPagada = (c: Pick<Cuota, "pendiente">) => c.pendiente <= TOLERANCIA;

/** En qué va una cuota hoy: pagada a tiempo o tarde, vence en N días, vence hoy, vencida, o (el saldo) se paga al llegar. */
export function estadoCuota(c: Cuota, hoy: string): EstadoCuota {
  if (estaPagada(c)) {
    if (!c.vence || !c.fechaPago) return { tono: "exito", texto: "Pagado", atraso: 0 };
    const tarde = diasEntre(c.vence, c.fechaPago);
    return tarde > 0 ? { tono: "aviso", texto: `Pagado ${tarde} d tarde`, atraso: tarde } : { tono: "exito", texto: "Pagado a tiempo", atraso: 0 };
  }
  if (!c.vence) return { tono: "neutro", texto: "Al llegar", atraso: 0 };
  const faltan = diasEntre(hoy, c.vence);
  if (faltan < 0) return { tono: "peligro", texto: `Vencido ${-faltan} d`, atraso: -faltan };
  if (faltan === 0) return { tono: "aviso", texto: "Vence hoy", atraso: 0 };
  return { tono: faltan <= 3 ? "aviso" : "info", texto: `Vence en ${faltan} d`, atraso: 0 };
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
