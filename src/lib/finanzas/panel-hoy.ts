// Panel para el celular con los 6 números del día (mejora 91): ventas de ayer, caja del día, por cobrar a Dropi,
// efectivo en repartidores, EBITDA del mes a la fecha y alertas abiertas. Cuentas puras sobre lo que lee la página
// `/panel-financiero/hoy`. Prueba en `panel-hoy.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Ventas de un día: las órdenes de ese día menos las canceladas y las no gestionadas. */
export function ventasDelDia(filas: { total: number | string; estado_entrega: string }[]): { total: number; ordenes: number } {
  const validas = filas.filter((f) => f.estado_entrega !== "cancelada" && f.estado_entrega !== "no_gestionada");
  return { total: r2(validas.reduce((a, f) => a + Number(f.total), 0)), ordenes: validas.length };
}

/**
 * El efectivo que tienen los repartidores: lo cobrado en efectivo de las semanas cuyo cierre todavía no está cerrado ni
 * pagado (al cerrar, el efectivo se descuenta de su pago o lo entregan).
 */
export function efectivoEnRepartidores(
  semanas: { repartidor_id: string; semana: string; cobrado_efectivo: number | string }[],
  cierres: { repartidor_id: string; semana: string; estado: string }[],
): { total: number; repartidores: number } {
  const cerradas = new Set(cierres.filter((c) => c.estado === "cerrado" || c.estado === "pagado").map((c) => `${c.repartidor_id}|${String(c.semana).slice(0, 10)}`));
  const abiertas = semanas.filter((s) => !cerradas.has(`${s.repartidor_id}|${String(s.semana).slice(0, 10)}`) && Number(s.cobrado_efectivo) > 0);
  return { total: r2(abiertas.reduce((a, s) => a + Number(s.cobrado_efectivo), 0)), repartidores: new Set(abiertas.map((s) => s.repartidor_id)).size };
}

/**
 * Lo que Dropi nos debe (en dólares): el último saldo de billetera registrado de cada país en USD o, si un país no tiene,
 * ganancias − retiros de `fin_dropi_mensual`.
 */
export function porCobrarDropi(
  saldos: { pais_id: string; monto: number | string; fecha: string }[],
  mensual: { pais_id: string; moneda: string; ganancias: number | string; retiros: number | string }[],
): number | null {
  const paises = new Set([...mensual.filter((m) => m.moneda === "USD").map((m) => m.pais_id)]);
  const enUsd = new Set(paises);
  for (const s of saldos) if (!mensual.some((m) => m.pais_id === s.pais_id && m.moneda !== "USD")) paises.add(s.pais_id);
  if (!paises.size) return null;
  let total = 0;
  for (const p of paises) {
    const ultimo = saldos.filter((s) => s.pais_id === p).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    if (ultimo) total += Number(ultimo.monto);
    else if (enUsd.has(p)) total += mensual.filter((m) => m.pais_id === p).reduce((a, m) => a + Number(m.ganancias) - Number(m.retiros), 0);
  }
  return r2(total);
}
