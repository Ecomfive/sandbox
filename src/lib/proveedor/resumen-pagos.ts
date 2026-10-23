// Portal del proveedor: las cuotas de cada envío (pedidos del espejo e historial suelto de las hojas de Shen Zhen) y el resumen de pagos que
// ven las dos vistas. Lógica pura: los datos los trae `cargarPagosProveedor` (pagos-datos.ts).

import { cuotasDe, cumplimiento, estadoCuota, estaPagada, saldoTrasLlegada, type Cuota, type EstadoCuota, type Pago, type TipoCuota } from "./cuotas";
import { diasEntre } from "./fechas";
import { filaDeHoja, filaDePedido, type Registro } from "./registro-pagos";

export interface PagosDe {
  anticipo: Pago[];
  saldo: Pago[];
}

/** Una fila de las hojas de Shen Zhen sin compra en el sistema: cuenta para el cumplimiento, no se paga desde el portal. */
export interface HistorialSuelto {
  id: string;
  /** Su clave en las hojas («PA#123»): no cambia al volver a importar (la usa el Registro de pagos). */
  clave: string;
  unidades: number | null;
  producto: string;
  paisCodigo: string | null;
  montoTotal: number;
  anticipoMonto: number;
  fechaEnvio: string;
  fechaLlegada: string | null;
  pagos: PagosDe;
}

/** Lo mínimo de un pedido para sus cuotas. */
export interface PedidoConPagos {
  id: string;
  unidades: number | null;
  producto: string;
  referencia: string | null;
  paisCodigo: string | null;
  fotoReferencia: string | null;
  etapa: string;
  montoTotal: number | null;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  anticipoMonto: number | null;
}

export interface EnvioConCuotas {
  clave: string;
  /** La fila del Registro de pagos (`proveedor_registro.fila`). */
  fila: string;
  unidades: number | null;
  pedidoId: string | null;
  producto: string;
  referencia: string | null;
  paisCodigo: string | null;
  fotoReferencia: string | null;
  fechaEnvio: string;
  fechaLlegada: string | null;
  montoTotal: number;
  cuotas: Cuota[];
}

export interface DatosPagos {
  pagosPorPedido: Record<string, PagosDe>;
  /**
   * Lo que dice la hoja de Shen Zhen de los pedidos que vinieron en ella (sus pagos se conocen): el total y el anticipo que facturó (manda
   * sobre el total de la compra, que a veces difiere en unos dólares) y la llegada, si la compra no la tiene.
   */
  hojaPorPedido: Record<string, { monto: number; anticipo: number; llegada: string | null }>;
  historialSuelto: HistorialSuelto[];
  /** El envío más reciente de las hojas: lo que salió después se controla solo con los avisos del portal. */
  ultimaHoja: string | null;
  /** Lo editado en el Registro de pagos (migración 0142), por fila; vacío sin la migración. */
  registro: Record<string, Registro>;
}

const n = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const f = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : String(v));

/**
 * Lo editado en el Registro de pagos que cuenta para las cuotas: monto, envío, anticipo, lo pagado del anticipo (y su fecha) y la fecha
 * en que se pagó el saldo (el saldo completo). Sin pagar, vence y saldo escritos a mano solo cambian lo que muestra la tabla.
 */
export function conRegistro(
  base: { montoTotal: number | null; fechaEnvio: string | null; anticipoMonto: number | null; pagos: PagosDe },
  r: Registro | undefined,
  porcentajeAnticipo: number,
): { montoTotal: number | null; fechaEnvio: string | null; anticipoMonto: number | null; pagos: PagosDe } {
  if (!r) return base;
  const montoTotal = n(r.monto) ?? base.montoTotal;
  const fechaEnvio = f(r.fecha_envio) ?? base.fechaEnvio;
  const anticipoMonto = n(r.anticipo) ?? base.anticipoMonto;
  const pagado = n(r.pagado);
  const fechaPago = f(r.fecha_pago);
  const anticipo =
    pagado !== null
      ? pagado > 0
        ? [{ monto: pagado, fecha: fechaPago ?? fechaEnvio ?? "" }]
        : []
      : fechaPago
        ? base.pagos.anticipo.map((p) => ({ ...p, fecha: fechaPago }))
        : base.pagos.anticipo;
  const fechaSaldo = f(r.fecha_pago_saldo);
  const montoAnticipo = montoTotal ? Math.min(montoTotal, anticipoMonto ?? (montoTotal * porcentajeAnticipo) / 100) : 0;
  const saldo = fechaSaldo && montoTotal ? [{ monto: Math.round((montoTotal - montoAnticipo) * 100) / 100, fecha: fechaSaldo }] : base.pagos.saldo;
  return { montoTotal, fechaEnvio, anticipoMonto, pagos: { anticipo, saldo } };
}

/**
 * Los envíos cuyos pagos se controlan: los pedidos que vinieron en las hojas de Shen Zhen, los enviados después de la última hoja (sus pagos
 * llegan por los avisos del portal) y el historial suelto. Un pedido viejo que no estaba en las hojas no se cuenta: no se sabe qué se
 * pagó y saldría vencido sin estarlo.
 */
export function enviosConCuotas(pedidos: PedidoConPagos[], datos: DatosPagos, porcentajeAnticipo: number, diasAnticipo: number): EnvioConCuotas[] {
  const vacio: PagosDe = { anticipo: [], saldo: [] };
  const envios: EnvioConCuotas[] = [];
  for (const p of pedidos) {
    const hoja = datos.hojaPorPedido[p.id];
    const fila = filaDePedido(p.id);
    const r = datos.registro[fila];
    const { montoTotal, fechaEnvio, anticipoMonto, pagos } = conRegistro(
      { montoTotal: hoja?.monto ?? p.montoTotal, fechaEnvio: p.fechaEnvio, anticipoMonto: hoja?.anticipo ?? p.anticipoMonto, pagos: datos.pagosPorPedido[p.id] ?? vacio },
      r,
      porcentajeAnticipo,
    );
    if (!fechaEnvio || !montoTotal) continue;
    if (!hoja && !r && datos.ultimaHoja && fechaEnvio <= datos.ultimaHoja) continue;
    const fechaLlegada = p.fechaLlegada ?? hoja?.llegada ?? null;
    envios.push({
      clave: p.id,
      fila,
      unidades: p.unidades,
      pedidoId: p.id,
      producto: p.producto,
      referencia: p.referencia,
      paisCodigo: p.paisCodigo,
      fotoReferencia: p.fotoReferencia,
      fechaEnvio,
      fechaLlegada,
      montoTotal,
      cuotas: cuotasDe({ montoTotal, fechaEnvio, fechaLlegada, anticipoMonto, pagosAnticipo: pagos.anticipo, pagosSaldo: pagos.saldo }, porcentajeAnticipo, diasAnticipo),
    });
  }
  for (const h of datos.historialSuelto) {
    const fila = filaDeHoja(h.clave);
    const { montoTotal, fechaEnvio, anticipoMonto, pagos } = conRegistro(
      { montoTotal: h.montoTotal, fechaEnvio: h.fechaEnvio, anticipoMonto: h.anticipoMonto, pagos: h.pagos },
      datos.registro[fila],
      porcentajeAnticipo,
    );
    if (!fechaEnvio || !montoTotal) continue;
    envios.push({
      clave: fila,
      fila,
      unidades: h.unidades,
      pedidoId: null,
      producto: h.producto,
      referencia: null,
      paisCodigo: h.paisCodigo,
      fotoReferencia: null,
      fechaEnvio,
      fechaLlegada: h.fechaLlegada,
      montoTotal,
      cuotas: cuotasDe({ montoTotal, fechaEnvio, fechaLlegada: h.fechaLlegada, anticipoMonto, pagosAnticipo: pagos.anticipo, pagosSaldo: pagos.saldo }, porcentajeAnticipo, diasAnticipo),
    });
  }
  return envios.sort((a, b) => b.fechaEnvio.localeCompare(a.fechaEnvio));
}

/** Una cuota por pagar (de un pedido del portal), con su estado y si ya está en un aviso esperando al proveedor. */
export interface CuotaPorPagar {
  clave: string;
  pedidoId: string;
  producto: string;
  referencia: string | null;
  paisCodigo: string | null;
  fotoReferencia: string | null;
  fechaEnvio: string;
  cuota: TipoCuota;
  monto: number;
  vence: string;
  estado: EstadoCuota;
  avisada: boolean;
}

export const claveCuota = (pedidoId: string, cuota: TipoCuota) => `${pedidoId}:${cuota}`;

/** Lo que falta pagar y ya se puede pagar: anticipos y saldos de lo que llegó. El saldo de lo que va en camino todavía no. */
export function cuotasPorPagar(envios: EnvioConCuotas[], hoy: string, avisadas: Set<string>): CuotaPorPagar[] {
  const lista: CuotaPorPagar[] = [];
  for (const e of envios) {
    if (!e.pedidoId) continue;
    for (const c of e.cuotas) {
      if (estaPagada(c) || !c.vence) continue;
      const clave = claveCuota(e.pedidoId, c.cuota);
      lista.push({ clave, pedidoId: e.pedidoId, producto: e.producto, referencia: e.referencia, paisCodigo: e.paisCodigo, fotoReferencia: e.fotoReferencia, fechaEnvio: e.fechaEnvio, cuota: c.cuota, monto: c.pendiente, vence: c.vence, estado: estadoCuota(c, hoy), avisada: avisadas.has(clave) });
    }
  }
  return lista.sort((a, b) => a.vence.localeCompare(b.vence));
}

export interface ResumenPagos {
  anticipos: ReturnType<typeof cumplimiento> & { desde: string };
  saldos: ReturnType<typeof saldoTrasLlegada>;
  venceSemana: { monto: number; cuotas: number };
  vencido: { monto: number; cuotas: number };
  anticiposProximos: { monto: number; cuotas: number };
  saldoEnCamino: number;
}

/** Los indicadores de pagos: cumplimiento de anticipos (desde `desde`), saldo tras la llegada, lo que vence y lo que viene en camino. */
export function resumenPagos(envios: EnvioConCuotas[], porPagar: CuotaPorPagar[], hoy: string, desde: string): ResumenPagos {
  const anticipos = envios.filter((e) => e.fechaEnvio >= desde).flatMap((e) => e.cuotas.filter((c) => c.cuota === "anticipo"));
  const saldos = envios.flatMap((e) => e.cuotas.filter((c) => c.cuota === "saldo"));
  const suma = (xs: CuotaPorPagar[]) => ({ monto: Math.round(xs.reduce((s, c) => s + c.monto, 0) * 100) / 100, cuotas: xs.length });
  return {
    anticipos: { ...cumplimiento(anticipos), desde },
    saldos: saldoTrasLlegada(saldos),
    venceSemana: suma(porPagar.filter((c) => diasEntre(hoy, c.vence) >= 0 && diasEntre(hoy, c.vence) <= 7)),
    vencido: suma(porPagar.filter((c) => diasEntre(hoy, c.vence) < 0)),
    anticiposProximos: suma(porPagar.filter((c) => c.cuota === "anticipo" && diasEntre(hoy, c.vence) <= 10)),
    saldoEnCamino: Math.round(saldos.filter((c) => !c.vence && !estaPagada(c)).reduce((s, c) => s + c.pendiente, 0) * 100) / 100,
  };
}
