// Portal del proveedor: las cuotas de cada envío (pedidos del espejo e historial suelto de las hojas de Chin) y el resumen de pagos que
// ven las dos vistas. Lógica pura: los datos los trae `cargarPagosProveedor` (pagos-datos.ts).

import { cuotasDe, cumplimiento, estadoCuota, estaPagada, saldoTrasLlegada, type Cuota, type EstadoCuota, type Pago, type TipoCuota } from "./cuotas";
import { diasEntre } from "./fechas";

export interface PagosDe {
  anticipo: Pago[];
  saldo: Pago[];
}

/** Una fila de las hojas de Chin sin compra en el sistema: cuenta para el cumplimiento, no se paga desde el portal. */
export interface HistorialSuelto {
  id: string;
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
  /** La llegada que dice la hoja de Chin, si la compra no la tiene. */
  llegadaHoja: Record<string, string>;
  /** Los pedidos que salieron de la hoja (sus pagos se conocen). */
  conHoja: string[];
  historialSuelto: HistorialSuelto[];
  /** El envío más reciente de las hojas: lo que salió después se controla solo con los avisos del portal. */
  ultimaHoja: string | null;
}

/**
 * Los envíos cuyos pagos se controlan: los pedidos que vinieron en las hojas de Chin, los enviados después de la última hoja (sus pagos
 * llegan por los avisos del portal) y el historial suelto. Un pedido viejo que no estaba en las hojas no se cuenta: no se sabe qué se
 * pagó y saldría vencido sin estarlo.
 */
export function enviosConCuotas(pedidos: PedidoConPagos[], datos: DatosPagos, porcentajeAnticipo: number, diasAnticipo: number): EnvioConCuotas[] {
  const conHoja = new Set(datos.conHoja);
  const vacio: PagosDe = { anticipo: [], saldo: [] };
  const envios: EnvioConCuotas[] = [];
  for (const p of pedidos) {
    if (!p.fechaEnvio || !p.montoTotal) continue;
    if (!conHoja.has(p.id) && datos.ultimaHoja && p.fechaEnvio <= datos.ultimaHoja) continue;
    const pagos = datos.pagosPorPedido[p.id] ?? vacio;
    const fechaLlegada = p.fechaLlegada ?? datos.llegadaHoja[p.id] ?? null;
    envios.push({
      clave: p.id,
      pedidoId: p.id,
      producto: p.producto,
      referencia: p.referencia,
      paisCodigo: p.paisCodigo,
      fotoReferencia: p.fotoReferencia,
      fechaEnvio: p.fechaEnvio,
      fechaLlegada,
      montoTotal: p.montoTotal,
      cuotas: cuotasDe({ montoTotal: p.montoTotal, fechaEnvio: p.fechaEnvio, fechaLlegada, anticipoMonto: p.anticipoMonto, pagosAnticipo: pagos.anticipo, pagosSaldo: pagos.saldo }, porcentajeAnticipo, diasAnticipo),
    });
  }
  for (const h of datos.historialSuelto) {
    envios.push({
      clave: `h:${h.id}`,
      pedidoId: null,
      producto: h.producto,
      referencia: null,
      paisCodigo: h.paisCodigo,
      fotoReferencia: null,
      fechaEnvio: h.fechaEnvio,
      fechaLlegada: h.fechaLlegada,
      montoTotal: h.montoTotal,
      cuotas: cuotasDe({ montoTotal: h.montoTotal, fechaEnvio: h.fechaEnvio, fechaLlegada: h.fechaLlegada, anticipoMonto: h.anticipoMonto, pagosAnticipo: h.pagos.anticipo, pagosSaldo: h.pagos.saldo }, porcentajeAnticipo, diasAnticipo),
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
