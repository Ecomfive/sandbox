// Portal del proveedor › «Registro de pagos» (23 oct 2026, pedido de Hernán): los envíos con las columnas de la hoja «payment record»
// de Chin (Product, Quantity, Amount, Delivery Time, Down payment, Paid amount, Payment Time, Unpaid Amount, Due date for payment,
// Balance payment, Arrival Time, Paid Time). Chin anota aquí lo que recibe; Ecomfive lo ve igual, solo para leer. Lógica pura.

import { estadoCuota, type EstadoCuota, type TipoCuota } from "./cuotas";
import type { EnvioConCuotas } from "./resumen-pagos";

/** Un pago que anotó el proveedor (se puede quitar si se equivocó). */
export interface PagoAnotado {
  id: string;
  cuota: TipoCuota;
  monto: number;
  fecha: string;
}

export interface FilaRegistro {
  clave: string;
  /** null: fila del historial de sus hojas sin compra en el sistema (no se anota nada en ella). */
  pedidoId: string | null;
  producto: string;
  paisCodigo: string | null;
  unidades: number | null;
  /** Amount. */
  monto: number;
  /** Delivery Time. */
  envio: string;
  /** Down payment. */
  anticipo: number;
  /** Paid amount y Payment Time del anticipo. */
  pagadoAnticipo: number;
  fechaPagoAnticipo: string | null;
  /** Unpaid Amount. */
  sinPagar: number;
  /** Due date for payment: solo mientras falte pagar el anticipo. */
  vence: string | null;
  estadoAnticipo: EstadoCuota | null;
  /** Balance payment: lo que falta del saldo. */
  saldo: number;
  /** Arrival Time: la que anotó el proveedor o, si no, la de la compra. */
  llegada: string | null;
  /** La llegada viene del proveedor (y no de la compra). */
  llegadaPropia: boolean;
  /** Paid Time: cuándo se pagó el saldo. */
  fechaPagoSaldo: string | null;
  anotados: PagoAnotado[];
}

export interface DatosRegistro {
  unidades: Record<string, number | null>;
  llegadaProveedor: Record<string, string>;
  anotados: Record<string, PagoAnotado[]>;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Una fila por envío, del más nuevo al más viejo (como `enviosConCuotas`). */
export function filasRegistro(envios: EnvioConCuotas[], datos: DatosRegistro, hoy: string): FilaRegistro[] {
  return envios.map((e) => {
    const anticipo = e.cuotas.find((c) => c.cuota === "anticipo") ?? null;
    const saldo = e.cuotas.find((c) => c.cuota === "saldo") ?? null;
    const propia = e.pedidoId ? (datos.llegadaProveedor[e.pedidoId] ?? null) : null;
    return {
      clave: e.clave,
      pedidoId: e.pedidoId,
      producto: e.producto,
      paisCodigo: e.paisCodigo,
      unidades: datos.unidades[e.clave] ?? null,
      monto: e.montoTotal,
      envio: e.fechaEnvio,
      anticipo: anticipo?.monto ?? 0,
      pagadoAnticipo: redondear(anticipo?.pagado ?? 0),
      fechaPagoAnticipo: anticipo && anticipo.pagado > 0 ? anticipo.fechaPago : null,
      sinPagar: redondear(anticipo?.pendiente ?? 0),
      vence: anticipo && anticipo.pendiente > 0 ? anticipo.vence : null,
      estadoAnticipo: anticipo ? estadoCuota(anticipo, hoy) : null,
      saldo: redondear(saldo?.pendiente ?? 0),
      llegada: propia ?? e.fechaLlegada,
      llegadaPropia: !!propia,
      fechaPagoSaldo: saldo && saldo.pagado > 0 ? saldo.fechaPago : null,
      anotados: e.pedidoId ? (datos.anotados[e.pedidoId] ?? []) : [],
    };
  });
}

/** Los totales de la última fila de la hoja: lo que falta de anticipos y de saldos. */
export function totalesRegistro(filas: FilaRegistro[]) {
  return { sinPagar: redondear(filas.reduce((s, f) => s + f.sinPagar, 0)), saldo: redondear(filas.reduce((s, f) => s + f.saldo, 0)) };
}

/** Lo que el proveedor puede anotar en una fila: la cuota que falta (primero el anticipo) y cuánto falta de ella. */
export function sugerenciaPago(f: FilaRegistro): { cuota: TipoCuota; monto: number } | null {
  if (!f.pedidoId) return null;
  if (f.sinPagar > 0) return { cuota: "anticipo", monto: f.sinPagar };
  if (f.saldo > 0) return { cuota: "saldo", monto: f.saldo };
  return null;
}
