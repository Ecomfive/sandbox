/**
 * La diferencia por cambio de cada mes (13 nov 2026, pedido de Hernán): lo que se pidió retirar menos lo que llegó a la cuenta, sumado por el mes de la
 * solicitud. Es la columna «Diferencia por cambio» de su Excel (Total − Total neto recibido) y le sirve para cargar ese gasto global de comisión a los
 * gastos de Ecomfive. Cuenta solo los retiros cerrados con lo recibido anotado; los cancelados no cuentan (el dinero volvió a la wallet). Los cerrados sin
 * monto recibido se cuentan aparte para avisar que a ese mes le falta un dato.
 */

export type RetiroParaDiferencia = { fecha: string; estado: string; monto: number; montoRecibido: number | null };

export type DiferenciaMes = {
  /** AAAA-MM, el mes de la solicitud. */
  mes: string;
  retiros: number;
  monto: number;
  recibido: number;
  diferencia: number;
  /** Cerrados de ese mes sin monto recibido: no entran en la suma. */
  sinRecibido: number;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Los meses con retiros cerrados, del más reciente al más viejo. */
export function diferenciaPorMes(retiros: RetiroParaDiferencia[]): DiferenciaMes[] {
  const porMes = new Map<string, DiferenciaMes>();
  for (const r of retiros) {
    if (r.estado !== "cerrado" || !/^\d{4}-\d{2}/.test(r.fecha)) continue;
    const mes = r.fecha.slice(0, 7);
    const m = porMes.get(mes) ?? { mes, retiros: 0, monto: 0, recibido: 0, diferencia: 0, sinRecibido: 0 };
    porMes.set(mes, m);
    if (r.montoRecibido === null || !Number.isFinite(r.montoRecibido) || !Number.isFinite(r.monto)) {
      m.sinRecibido++;
      continue;
    }
    m.retiros++;
    m.monto += r.monto;
    m.recibido += r.montoRecibido;
  }
  return [...porMes.values()]
    .map((m) => ({ ...m, monto: redondear(m.monto), recibido: redondear(m.recibido), diferencia: redondear(m.monto - m.recibido) }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}
