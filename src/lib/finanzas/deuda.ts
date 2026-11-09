// Portal AF4 360° › Tesorería › Deuda. Lógica pura: préstamos con amortización francesa (cuota fija), su saldo a una fecha
// (corriente y no corriente, como `fin_deuda_al` de la migración 0932, que usa la misma fórmula) y el estado de las líneas
// de crédito (disponible, uso, intereses del mes, renovación). Prueba en `deuda.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;

export const CLASES_PRESTAMO = [
  { clave: "prestamo", etiqueta: "Préstamo" },
  { clave: "financiamiento", etiqueta: "Financiamiento" },
  { clave: "leasing", etiqueta: "Leasing" },
] as const;
export type ClasePrestamo = (typeof CLASES_PRESTAMO)[number]["clave"];
export const esClasePrestamo = (v: unknown): v is ClasePrestamo => typeof v === "string" && CLASES_PRESTAMO.some((c) => c.clave === v);

export interface Prestamo {
  id: string;
  nombre: string;
  acreedor: string | null;
  clase: ClasePrestamo;
  monto: number;
  /** Fracción anual (0,12 = 12 %). */
  tasaAnual: number;
  plazoMeses: number;
  fechaDesembolso: string;
  primerVencimiento: string;
  tipoId: string | null;
  cuentaId: string | null;
  /** El nombre del tipo del libro con que se registra la cuota. */
  tipoNombre?: string | null;
  /** Penalidad por prepagar: fracción de lo prepagado (0,02 = 2 %). Migración 0946; sin ella, 0. */
  penalidadPrepago?: number;
  /** Comisión fija por prepagar, en USD (migración 0946). */
  comisionPrepago?: number;
}

export interface Cuota {
  numero: number;
  fecha: string;
  cuota: number;
  interes: number;
  capital: number;
  /** Lo que queda después de pagarla. */
  saldo: number;
}

/** La cuota fija de un préstamo francés. Sin tasa, el monto en partes iguales. */
export function cuotaFrancesa(monto: number, tasaAnual: number, n: number): number {
  if (n <= 0) return 0;
  const i = tasaAnual / 12;
  if (i === 0) return r2(monto / n);
  return r2((monto * i) / (1 - Math.pow(1 + i, -n)));
}

/** El primer vencimiento + `k` meses, recortado al último día del mes (como Postgres: 31 ene + 1 mes = 28 feb). */
export function sumarMesesFecha(fecha: string, k: number): string {
  const a = Number(fecha.slice(0, 4));
  const m = Number(fecha.slice(5, 7)) - 1 + k;
  const d = Number(fecha.slice(8, 10));
  const anio = a + Math.floor(m / 12);
  const mes = ((m % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** Saldo después de `k` cuotas (la fórmula cerrada de la migración 0932). */
export function saldoFrances(monto: number, tasaAnual: number, n: number, k: number): number {
  const kk = Math.min(Math.max(k, 0), n);
  if (kk >= n) return 0;
  const i = tasaAnual / 12;
  if (i === 0) return r2(monto - (monto / n) * kk);
  const c = (monto * i) / (1 - Math.pow(1 + i, -n));
  return r2(monto * Math.pow(1 + i, kk) - (c * (Math.pow(1 + i, kk) - 1)) / i);
}

/** La tabla completa. La última cuota ajusta el redondeo para que el saldo quede en cero. */
export function tablaAmortizacion(p: Pick<Prestamo, "monto" | "tasaAnual" | "plazoMeses" | "primerVencimiento">): Cuota[] {
  const n = p.plazoMeses;
  const cuota = cuotaFrancesa(p.monto, p.tasaAnual, n);
  const i = p.tasaAnual / 12;
  const salida: Cuota[] = [];
  let saldo = p.monto;
  for (let k = 1; k <= n; k++) {
    const interes = r2(saldo * i);
    let capital = r2(cuota - interes);
    if (k === n) capital = r2(saldo);
    saldo = r2(saldo - capital);
    salida.push({ numero: k, fecha: sumarMesesFecha(p.primerVencimiento, k - 1), cuota: r2(capital + interes), interes, capital, saldo: Math.max(saldo, 0) });
  }
  return salida;
}

export interface SaldoPrestamo {
  saldo: number;
  /** Capital que vence en los 12 meses siguientes al corte. */
  corriente: number;
  noCorriente: number;
  cuotasPagadas: number;
  proxima: Cuota | null;
}

/** El saldo a una fecha, dando por pagada cada cuota en su fecha. Antes del desembolso, nada. */
export function saldoAl(p: Prestamo, corte: string, tabla = tablaAmortizacion(p)): SaldoPrestamo {
  if (corte < p.fechaDesembolso) return { saldo: 0, corriente: 0, noCorriente: 0, cuotasPagadas: 0, proxima: tabla[0] ?? null };
  const k = tabla.filter((c) => c.fecha <= corte).length;
  const en12 = sumarMesesFecha(corte, 12);
  const k12 = tabla.filter((c) => c.fecha <= en12).length;
  const saldo = k === 0 ? r2(p.monto) : tabla[k - 1].saldo;
  const saldo12 = k12 === 0 ? r2(p.monto) : tabla[k12 - 1].saldo;
  return { saldo, corriente: r2(saldo - saldo12), noCorriente: saldo12, cuotasPagadas: k, proxima: tabla[k] ?? null };
}

/** Las cuotas con fecha entre dos días (inclusive). */
export const cuotasEntre = (tabla: Cuota[], desde: string, hasta: string) => tabla.filter((c) => c.fecha >= desde && c.fecha <= hasta);

/** Lee una tasa escrita como porcentaje («12», «12,5 %») a fracción anual. */
export function leerTasa(v: unknown): number | null {
  const s = String(v ?? "").replace(/[%\s]/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 200 ? Math.round(n * 10_000) / 1_000_000 : null;
}

// ---------------------------------------------------------------------------------------------
// Líneas de crédito
// ---------------------------------------------------------------------------------------------

export interface LineaCredito {
  id: string;
  nombre: string;
  banco: string | null;
  cupo: number;
  usado: number;
  usadoAl: string;
  tasaAnual: number;
  fechaRenovacion: string | null;
  penalidadPrepago?: number;
  comisionPrepago?: number;
}

/** Desde qué uso del cupo se avisa. */
export const USO_ALTO = 0.9;
export const DIAS_AVISO_RENOVACION = 30;

export type AlertaLinea = "vencida" | "renovacion" | "uso_alto";

export interface EstadoLinea {
  disponible: number;
  /** Fracción del cupo usada (0 a 1+). */
  uso: number;
  /** Interés estimado del mes: usado × tasa ÷ 12. */
  interesesMes: number;
  diasParaRenovar: number | null;
  alertas: AlertaLinea[];
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export function estadoLinea(l: LineaCredito, hoy: string, diasAviso = DIAS_AVISO_RENOVACION): EstadoLinea {
  const uso = l.cupo > 0 ? l.usado / l.cupo : 0;
  const dias = l.fechaRenovacion ? diasEntre(hoy, l.fechaRenovacion) : null;
  const alertas: AlertaLinea[] = [];
  if (dias !== null && dias < 0) alertas.push("vencida");
  else if (dias !== null && dias <= diasAviso) alertas.push("renovacion");
  if (uso >= USO_ALTO) alertas.push("uso_alto");
  return { disponible: r2(l.cupo - l.usado), uso: Math.round(uso * 10_000) / 10_000, interesesMes: r2((l.usado * l.tasaAnual) / 12), diasParaRenovar: dias, alertas };
}

/** Lo que sale de caja por deuda en una ventana: cuotas de los préstamos e intereses de las líneas al fin de cada mes. */
export interface PagoDeuda {
  fecha: string;
  concepto: string;
  monto: number;
  origen: "prestamo" | "linea" | "ciclo";
  /** «<préstamo>:<n>» o «linea:<id>:<AAAA-MM>». */
  ref: string;
}

export function pagosDeuda(prestamos: Prestamo[], lineas: LineaCredito[], desde: string, hasta: string, ciclos: FinanciamientoCiclo[] = []): PagoDeuda[] {
  const salida: PagoDeuda[] = [];
  for (const c of ciclos) {
    for (const v of vencimientosCiclo(c, desde, hasta)) {
      salida.push({
        fecha: v.fecha,
        concepto: `${c.nombre} · ${v.capital > 0 ? "vencimiento" : `costo del ciclo ${v.numero}`}`,
        monto: r2(v.interes + v.capital),
        origen: "ciclo",
        ref: `ciclo:${c.id}:${v.numero}`,
      });
    }
  }
  for (const p of prestamos) {
    for (const c of cuotasEntre(tablaAmortizacion(p), desde, hasta)) {
      salida.push({ fecha: c.fecha, concepto: `${p.nombre} · cuota ${c.numero} de ${p.plazoMeses}`, monto: c.cuota, origen: "prestamo", ref: `${p.id}:${c.numero}` });
    }
  }
  for (const l of lineas) {
    const interes = r2((l.usado * l.tasaAnual) / 12);
    if (interes <= 0) continue;
    let mes = `${desde.slice(0, 7)}-01`;
    while (mes <= hasta) {
      const fin = sumarMesesFecha(mes, 1);
      const ultimo = new Date(Date.parse(`${fin}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      if (ultimo >= desde && ultimo <= hasta) salida.push({ fecha: ultimo, concepto: `${l.nombre} · intereses`, monto: interes, origen: "linea", ref: `linea:${l.id}:${ultimo.slice(0, 7)}` });
      mes = fin;
    }
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------------------------------------------------------------------------------------------
// Financiamiento por ciclo (giros a un proveedor o financista: «20 % cada 70 días»), migración 0946
// ---------------------------------------------------------------------------------------------

export interface FinanciamientoCiclo {
  id: string;
  nombre: string;
  acreedor: string | null;
  /** Lo girado que sigue vigente, en USD. */
  monto: number;
  /** Costo de un ciclo como fracción del monto (0,2 = 20 %). */
  tasaCiclo: number;
  diasCiclo: number;
  /** El primer giro: los ciclos vencen cada `diasCiclo` días desde aquí. */
  fechaInicio: string;
  /** Al vencer se paga solo el costo y el monto sigue (se vuelve a girar). Si no, al primer vencimiento se paga todo. */
  renovable: boolean;
  penalidadPrepago?: number;
  comisionPrepago?: number;
  cuentaId?: string | null;
}

const DIA_MS = 86_400_000;
export const sumarDiasFecha = (f: string, n: number) => new Date(Date.parse(`${f.slice(0, 10)}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** La tasa efectiva anual de un costo por ciclo, capitalizando los ciclos del año: (1 + t)^(365 / días) − 1. */
export function tasaEfectivaAnualCiclo(tasaCiclo: number, diasCiclo: number): number {
  if (!(diasCiclo > 0) || !(tasaCiclo > 0)) return 0;
  return Math.pow(1 + tasaCiclo, 365 / diasCiclo) - 1;
}

/** La tasa efectiva anual de una tasa nominal anual que se paga mes a mes: (1 + i / 12)^12 − 1. */
export const tasaEfectivaAnualMensual = (tasaAnual: number): number => (tasaAnual > 0 ? Math.pow(1 + tasaAnual / 12, 12) - 1 : 0);

/** El vencimiento del ciclo `k` (1, 2, …). */
export const vencimientoCiclo = (c: Pick<FinanciamientoCiclo, "fechaInicio" | "diasCiclo">, k: number) => sumarDiasFecha(c.fechaInicio, c.diasCiclo * k);

/**
 * Los vencimientos entre dos días (inclusive): en cada uno se paga el costo del ciclo (monto × tasa). Uno no renovable
 * tiene un solo ciclo y en su vencimiento se paga además el monto.
 */
export function vencimientosCiclo(c: FinanciamientoCiclo, desde: string, hasta: string): { numero: number; fecha: string; interes: number; capital: number }[] {
  const salida: { numero: number; fecha: string; interes: number; capital: number }[] = [];
  if (!(c.diasCiclo > 0) || c.monto <= 0) return salida;
  const interes = r2(c.monto * c.tasaCiclo);
  if (!c.renovable) {
    const f = vencimientoCiclo(c, 1);
    if (f >= desde && f <= hasta) salida.push({ numero: 1, fecha: f, interes, capital: r2(c.monto) });
    return salida;
  }
  // El primer ciclo que vence desde `desde`.
  const transcurridos = Math.floor((Date.parse(`${desde}T00:00:00Z`) - Date.parse(`${c.fechaInicio}T00:00:00Z`)) / DIA_MS);
  let k = Math.max(1, Math.floor(transcurridos / c.diasCiclo));
  while (vencimientoCiclo(c, k) < desde) k++;
  for (let guarda = 0; guarda < 2000; guarda++, k++) {
    const f = vencimientoCiclo(c, k);
    if (f > hasta) break;
    salida.push({ numero: k, fecha: f, interes, capital: 0 });
  }
  return salida;
}

/** Lo que se debe a una fecha: el monto desde el primer giro y, si no se renueva, hasta su vencimiento. */
export function saldoCicloAl(c: FinanciamientoCiclo, corte: string): number {
  if (corte < c.fechaInicio) return 0;
  if (!c.renovable && vencimientoCiclo(c, 1) <= corte) return 0;
  return r2(c.monto);
}

/** El próximo vencimiento desde hoy (null si ya terminó). */
export function proximoVencimientoCiclo(c: FinanciamientoCiclo, hoy: string): string | null {
  return vencimientosCiclo(c, hoy, sumarDiasFecha(hoy, Math.max(c.diasCiclo, 1) * 2 + 1))[0]?.fecha ?? null;
}

/** Lee una fracción escrita como porcentaje para penalidades y comisiones porcentuales («2», «1,5 %»). */
export function leerPorcentaje(v: unknown, max = 100): number | null {
  const s = String(v ?? "").replace(/[%\s]/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10_000) / 1_000_000 : null;
}
