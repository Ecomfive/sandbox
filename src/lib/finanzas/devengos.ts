// Portal AF4 360° › Cierre de mes › Gastos prepagados (migración 0927, `fin_prepagos`). Lógica pura: un pago anual o
// adelantado (seguro, licencia, dominio) se reparte en cuotas iguales en los meses que cubre, y cada cuota entra al EERR
// de su mes como ajuste del cierre. Si el pago ya está en el EERR del libro (EERR = SI), el mes del pago lleva además un
// ajuste negativo por el total: así el gasto se ve repartido y no entero en el mes en que se pagó. Prueba en
// `devengos.test.ts`.

export interface Prepago {
  id: string;
  concepto: string;
  monto: number;
  /** Primer mes que cubre («AAAA-MM-01»). */
  desde: string;
  meses: number;
  /** Mes del pago («AAAA-MM-01»); sin dato, el primer mes que cubre. */
  periodoPago: string | null;
  pagoEnEerr: boolean;
  activo?: boolean;
}

export interface LineaDevengo {
  /** «cuota» (el gasto del mes) o «pago» (saca el pago del EERR del mes en que se pagó). */
  clase: "cuota" | "pago";
  /** Clave única dentro del prepago: «cuota:3» o «pago». */
  ref: string;
  monto: number;
  concepto: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function sumarMeses(periodo: string, n: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/** Las cuotas del prepago, mes a mes (la última absorbe los centavos para que sumen el total). */
export function cuotasPrepago(p: Pick<Prepago, "monto" | "desde" | "meses">): { periodo: string; numero: number; monto: number }[] {
  const n = Math.max(1, Math.min(60, Math.round(p.meses)));
  const cuota = r2(p.monto / n);
  return Array.from({ length: n }, (_, i) => ({
    periodo: sumarMeses(p.desde, i),
    numero: i + 1,
    monto: i === n - 1 ? r2(p.monto - cuota * (n - 1)) : cuota,
  }));
}

/** Lo que el prepago aporta a los ajustes de un mes (nada si no le toca o está inactivo). */
export function lineasDevengoDelMes(p: Prepago, periodo: string): LineaDevengo[] {
  if (p.activo === false) return [];
  const lineas: LineaDevengo[] = [];
  const pago = p.periodoPago ?? p.desde;
  if (p.pagoEnEerr && pago === periodo) {
    lineas.push({ clase: "pago", ref: "pago", monto: r2(-p.monto), concepto: `${p.concepto}: el pago pasa a prepagado` });
  }
  const cuotas = cuotasPrepago(p);
  const c = cuotas.find((x) => x.periodo === periodo);
  if (c) lineas.push({ clase: "cuota", ref: `cuota:${c.numero}`, monto: c.monto, concepto: `${p.concepto}: devengo ${c.numero} de ${cuotas.length}` });
  return lineas;
}

/** Cuánto lleva devengado hasta un mes (incluido) y cuánto queda por devengar. */
export function avancePrepago(p: Pick<Prepago, "monto" | "desde" | "meses">, hasta: string): { devengado: number; porDevengar: number; cuotas: number; de: number } {
  const cuotas = cuotasPrepago(p);
  const hechas = cuotas.filter((c) => c.periodo <= hasta);
  const devengado = r2(hechas.reduce((a, c) => a + c.monto, 0));
  return { devengado, porDevengar: r2(p.monto - devengado), cuotas: hechas.length, de: cuotas.length };
}

/** El último mes que cubre. */
export const hastaPrepago = (p: Pick<Prepago, "desde" | "meses">) => sumarMeses(p.desde, Math.max(1, Math.round(p.meses)) - 1);
