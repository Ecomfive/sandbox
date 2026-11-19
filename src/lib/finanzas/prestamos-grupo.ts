// Préstamos del grupo (Tesorería › Préstamos del grupo, migración 0983). Parte pura, con prueba en
// `prestamos-grupo.test.ts`: saldos por par acreedor → deudor, quién le debe a quién en neto, qué está vencido o vence
// pronto (los abonos pagan primero lo que vence antes) y el costo financiero con su tasa efectiva anual.

const r2 = (v: number) => Math.round(v * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CLASES_PARTE = [
  { clave: "empresa", etiqueta: "Empresa del grupo" },
  { clave: "socio", etiqueta: "Socio" },
  { clave: "financista", etiqueta: "Financista" },
] as const;
export type ClaseParte = (typeof CLASES_PARTE)[number]["clave"];

export const TIPOS_MOVIMIENTO_GRUPO = [
  { clave: "prestamo", etiqueta: "Préstamo" },
  { clave: "costo", etiqueta: "Costo (comisión, interés, cambio)" },
  { clave: "abono", etiqueta: "Abono" },
] as const;
export type TipoMovGrupo = (typeof TIPOS_MOVIMIENTO_GRUPO)[number]["clave"];
export const etiquetaTipoGrupo = (t: TipoMovGrupo) => TIPOS_MOVIMIENTO_GRUPO.find((x) => x.clave === t)?.etiqueta ?? t;

/** Días antes del vencimiento en que se avisa. */
export const DIAS_AVISO_VENCE = 7;
/** Días antes del vencimiento en que el aviso pasa a crítico (mejora 64). */
export const DIAS_AVISO_URGENTE = 2;

export interface ParteGrupo {
  id: string;
  nombre: string;
  clase: ClaseParte;
}

export interface MovGrupo {
  id: string;
  acreedorId: string;
  deudorId: string;
  tipo: TipoMovGrupo;
  fecha: string;
  vence: string | null;
  monto: number;
  concepto: string;
  ordenes: string[];
  /** Un préstamo de un socio puede ser aporte de capital (migración 0989): no es deuda ni vence. */
  naturaleza?: "deuda" | "aporte";
}

/** Lo que cuenta como deuda: todo menos los aportes de capital. */
export const esDeuda = (m: Pick<MovGrupo, "naturaleza">) => m.naturaleza !== "aporte";

export const clavePar = (acreedorId: string, deudorId: string) => `${acreedorId}|${deudorId}`;

export interface SaldoPar {
  acreedorId: string;
  deudorId: string;
  prestado: number;
  costo: number;
  abonado: number;
  /** prestado + costo − abonado (puede ser negativo si se pagó de más). */
  saldo: number;
  ultimo: string;
}

/** El saldo de cada par acreedor → deudor. */
export function saldosPorPar(movs: MovGrupo[]): SaldoPar[] {
  const m = new Map<string, SaldoPar>();
  for (const x of movs.filter(esDeuda)) {
    const k = clavePar(x.acreedorId, x.deudorId);
    const s = m.get(k) ?? { acreedorId: x.acreedorId, deudorId: x.deudorId, prestado: 0, costo: 0, abonado: 0, saldo: 0, ultimo: x.fecha };
    if (x.tipo === "prestamo") s.prestado += x.monto;
    else if (x.tipo === "costo") s.costo += x.monto;
    else s.abonado += x.monto;
    if (x.fecha > s.ultimo) s.ultimo = x.fecha;
    m.set(k, s);
  }
  return [...m.values()]
    .map((s) => ({ ...s, prestado: r2(s.prestado), costo: r2(s.costo), abonado: r2(s.abonado), saldo: r2(s.prestado + s.costo - s.abonado) }))
    .sort((a, b) => b.saldo - a.saldo);
}

export interface DeudaNeta {
  /** Quien debe, en neto. */
  deudorId: string;
  acreedorId: string;
  monto: number;
}

/**
 * Quién le debe a quién en neto: si Costa Rica le debe 10 a Panamá y Panamá le debe 3 a Costa Rica, queda Costa Rica → 7.
 * Sin pares en cero.
 */
export function deudasNetas(saldos: SaldoPar[]): DeudaNeta[] {
  const m = new Map<string, DeudaNeta>();
  for (const s of saldos) {
    const [a, b] = [s.acreedorId, s.deudorId].sort();
    const k = `${a}|${b}`;
    // Positivo = b le debe a a.
    const signo = s.acreedorId === a ? 1 : -1;
    const actual = m.get(k)?.monto ?? 0;
    m.set(k, { acreedorId: a, deudorId: b, monto: actual + signo * s.saldo });
  }
  return [...m.values()]
    .map((d) => (d.monto < 0 ? { acreedorId: d.deudorId, deudorId: d.acreedorId, monto: r2(-d.monto) } : { ...d, monto: r2(d.monto) }))
    .filter((d) => d.monto >= 0.01)
    .sort((a, b) => b.monto - a.monto);
}

export interface PosicionParte {
  parteId: string;
  /** Lo que le deben (neto, por par). */
  leDeben: number;
  /** Lo que debe (neto, por par). */
  debe: number;
  neto: number;
}

/** La posición neta de cada parte: le deben − debe. */
export function posicionPorParte(netas: DeudaNeta[]): PosicionParte[] {
  const m = new Map<string, PosicionParte>();
  const de = (id: string) => m.get(id) ?? { parteId: id, leDeben: 0, debe: 0, neto: 0 };
  for (const d of netas) {
    const a = de(d.acreedorId);
    a.leDeben += d.monto;
    m.set(d.acreedorId, a);
    const b = de(d.deudorId);
    b.debe += d.monto;
    m.set(d.deudorId, b);
  }
  return [...m.values()].map((p) => ({ ...p, leDeben: r2(p.leDeben), debe: r2(p.debe), neto: r2(p.leDeben - p.debe) })).sort((a, b) => a.neto - b.neto);
}

export interface CargoPendiente {
  id: string;
  acreedorId: string;
  deudorId: string;
  tipo: TipoMovGrupo;
  fecha: string;
  vence: string | null;
  concepto: string;
  ordenes: string[];
  monto: number;
  pendiente: number;
  estado: "vencido" | "por_vencer" | "al_dia" | "sin_fecha";
  /** Días al vencimiento (negativo = vencido hace N días). */
  dias: number | null;
}

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/**
 * Lo que sigue pendiente de cada préstamo o costo: por par, los abonos pagan primero lo que vence antes (o, sin
 * vencimiento, lo más viejo). Devuelve solo lo que tiene saldo.
 */
export function pendientes(movs: MovGrupo[], hoy: string): CargoPendiente[] {
  const porPar = new Map<string, MovGrupo[]>();
  for (const x of movs.filter(esDeuda)) {
    const k = clavePar(x.acreedorId, x.deudorId);
    porPar.set(k, [...(porPar.get(k) ?? []), x]);
  }
  const salida: CargoPendiente[] = [];
  for (const lista of porPar.values()) {
    let abonos = lista.filter((x) => x.tipo === "abono").reduce((a, x) => a + x.monto, 0);
    const cargos = lista
      .filter((x) => x.tipo !== "abono")
      .sort((a, b) => (a.vence ?? a.fecha).localeCompare(b.vence ?? b.fecha) || a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    for (const c of cargos) {
      const pagado = Math.min(abonos, c.monto);
      abonos -= pagado;
      const pendiente = r2(c.monto - pagado);
      if (pendiente < 0.01) continue;
      const d = c.vence ? dias(hoy, c.vence) : null;
      const estado = d === null ? "sin_fecha" : d < 0 ? "vencido" : d <= DIAS_AVISO_VENCE ? "por_vencer" : "al_dia";
      salida.push({ id: c.id, acreedorId: c.acreedorId, deudorId: c.deudorId, tipo: c.tipo, fecha: c.fecha, vence: c.vence, concepto: c.concepto, ordenes: c.ordenes, monto: c.monto, pendiente, estado, dias: d });
    }
  }
  return salida.sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999") || b.pendiente - a.pendiente);
}

/** Tasa efectiva anual de un financiamiento que cobra `costo` sobre `capital` en `dias` días. */
export function tasaEfectivaAnual(capital: number, costo: number, dias: number): number | null {
  if (capital <= 0 || costo < 0 || dias <= 0) return null;
  return Math.pow(1 + costo / capital, 365 / dias) - 1;
}

export interface CostoFinanciero {
  acreedorId: string;
  capital: number;
  costo: number;
  /** Días promedio entre el préstamo y su vencimiento, ponderado por capital. */
  diasPromedio: number | null;
  tasaAnual: number | null;
}

/**
 * Costo financiero por acreedor en un rango (por la fecha del costo). Empareja cada costo con el préstamo del mismo par y
 * mismas órdenes para medir el plazo; sin pareja, el plazo no cuenta.
 */
export function costoFinanciero(movs: MovGrupo[], desde: string, hasta: string): CostoFinanciero[] {
  const m = new Map<string, { capital: number; costo: number; diasCap: number; capDias: number }>();
  const prestamos = movs.filter((x) => x.tipo === "prestamo");
  for (const c of movs.filter((x) => x.tipo === "costo" && x.fecha >= desde && x.fecha <= hasta)) {
    const p = prestamos.find((x) => x.acreedorId === c.acreedorId && x.deudorId === c.deudorId && x.ordenes.join() === c.ordenes.join() && c.ordenes.length > 0 && x.fecha <= (c.vence ?? c.fecha));
    const s = m.get(c.acreedorId) ?? { capital: 0, costo: 0, diasCap: 0, capDias: 0 };
    s.costo += c.monto;
    if (p) {
      s.capital += p.monto;
      const d = dias(p.fecha, c.vence ?? c.fecha);
      if (d > 0) {
        s.diasCap += d * p.monto;
        s.capDias += p.monto;
      }
    }
    m.set(c.acreedorId, s);
  }
  return [...m]
    .map(([acreedorId, s]) => {
      const diasPromedio = s.capDias ? Math.round(s.diasCap / s.capDias) : null;
      return { acreedorId, capital: r2(s.capital), costo: r2(s.costo), diasPromedio, tasaAnual: diasPromedio ? tasaEfectivaAnual(s.capital, s.costo, diasPromedio) : null };
    })
    .sort((a, b) => b.costo - a.costo);
}

/** Códigos de orden de compra escritos a mano: «ECOM03-0016, ECOM-0373». */
export function leerOrdenes(texto: unknown): string[] {
  const s = typeof texto === "string" ? texto.toUpperCase() : "";
  return [...new Set(s.match(/\bECOM\d{0,2}-\d{3,5}\b/g) ?? [])].slice(0, 60);
}

export interface DatosMovGrupo {
  naturaleza: "deuda" | "aporte";
  soporte: string | null;
  acreedor_id: string;
  deudor_id: string;
  tipo: TipoMovGrupo;
  fecha: string;
  vence: string | null;
  monto: number;
  concepto: string;
  ordenes: string[];
  medio: string | null;
  nota: string | null;
}

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Valida la ficha de un movimiento. */
export function leerDatosMovGrupo(get: (campo: string) => unknown): DatosMovGrupo | { error: string } {
  const s = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const acreedor = s("acreedor_id");
  const deudor = s("deudor_id");
  if (!UUID.test(acreedor)) return { error: "Elige quién presta." };
  if (!UUID.test(deudor)) return { error: "Elige quién debe." };
  if (acreedor === deudor) return { error: "Quien presta y quien debe tienen que ser distintos." };
  const tipo = s("tipo");
  if (!TIPOS_MOVIMIENTO_GRUPO.some((t) => t.clave === tipo)) return { error: "Elige el tipo." };
  const fecha = s("fecha");
  if (!esFecha(fecha)) return { error: "La fecha no es válida." };
  const vence = s("vence") || null;
  if (vence && (!esFecha(vence) || vence < fecha)) return { error: "El vencimiento debe ser una fecha igual o posterior." };
  const monto = Number(s("monto").replace(/[$\s,]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0 || monto > 100_000_000) return { error: "El monto debe ser mayor a cero." };
  const concepto = s("concepto").replace(/\s+/g, " ").slice(0, 300);
  if (!concepto) return { error: "Falta el concepto." };
  const naturaleza = s("naturaleza") === "aporte" && tipo === "prestamo" ? "aporte" : "deuda";
  return {
    naturaleza,
    soporte: s("soporte").slice(0, 300) || null,
    acreedor_id: acreedor,
    deudor_id: deudor,
    tipo: tipo as TipoMovGrupo,
    fecha,
    vence: tipo === "abono" || naturaleza === "aporte" ? null : vence,
    monto: r2(monto),
    concepto,
    ordenes: leerOrdenes(s("ordenes")),
    medio: s("medio").slice(0, 60) || null,
    nota: s("nota").slice(0, 1000) || null,
  };
}

// ---------------------------------------------------------------------------------------------
// Mejoras 61 a 70 (19 nov 2026)
// ---------------------------------------------------------------------------------------------

export interface LineaEstadoCuenta {
  id: string;
  fecha: string;
  tipo: TipoMovGrupo;
  /** Quién le presta a quién en esta línea. */
  acreedorId: string;
  deudorId: string;
  concepto: string;
  ordenes: string[];
  /** Positivo: sube lo que `b` le debe a `a`; negativo, lo baja. */
  efecto: number;
  /** Lo que `b` le debe a `a` después de esta línea (negativo = `a` le debe a `b`). */
  saldo: number;
}

/**
 * Estado de cuenta de un par de partes (mejora 61), en neto: las líneas de las dos direcciones en orden, con el saldo que
 * `b` le debe a `a` después de cada una. Los aportes de capital no entran.
 */
export function estadoDeCuenta(movs: MovGrupo[], a: string, b: string): LineaEstadoCuenta[] {
  const del = movs
    .filter(esDeuda)
    .filter((m) => (m.acreedorId === a && m.deudorId === b) || (m.acreedorId === b && m.deudorId === a))
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id.localeCompare(y.id));
  let saldo = 0;
  return del.map((m) => {
    const sube = m.tipo === "abono" ? -m.monto : m.monto;
    const efecto = r2(m.acreedorId === a ? sube : -sube);
    saldo = r2(saldo + efecto);
    return { id: m.id, fecha: m.fecha, tipo: m.tipo, acreedorId: m.acreedorId, deudorId: m.deudorId, concepto: m.concepto, ordenes: m.ordenes, efecto, saldo };
  });
}

/** Lo que `b` le debe a `a` (neto) al final de `fecha`. */
export function saldoNetoAl(movs: MovGrupo[], a: string, b: string, fecha: string): number {
  return estadoDeCuenta(movs, a, b).filter((l) => l.fecha <= fecha).at(-1)?.saldo ?? 0;
}

/** Los días de un mes «AAAA-MM-01». */
const diasMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/**
 * Interés de un mes entre dos empresas (mejora 62): tasa anual simple sobre el saldo de cada día de lo que `deudor` le
 * debe a `acreedor` en esa dirección (sin netear, sin contar el interés ya cobrado de ese mismo mes). 365 días.
 */
export function interesDelMes(movs: MovGrupo[], acreedorId: string, deudorId: string, tasaAnual: number, mes: string, claveInteres?: (m: MovGrupo) => boolean): number {
  if (!(tasaAnual > 0)) return 0;
  const del = movs
    .filter(esDeuda)
    .filter((m) => m.acreedorId === acreedorId && m.deudorId === deudorId && !(claveInteres?.(m) ?? false))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
  const inicio = mes.slice(0, 7);
  let saldo = 0;
  let i = 0;
  let acumulado = 0;
  const n = diasMes(mes);
  for (let d = 1; d <= n; d++) {
    const dia = `${inicio}-${String(d).padStart(2, "0")}`;
    while (i < del.length && del[i].fecha <= dia) {
      saldo += del[i].tipo === "abono" ? -del[i].monto : del[i].monto;
      i++;
    }
    if (saldo > 0) acumulado += saldo;
  }
  return r2((acumulado * tasaAnual) / 365);
}

/** La clave para no registrar dos veces el interés de un mes. */
export const claveInteres = (acreedorId: string, deudorId: string, mes: string) => `interes:${acreedorId}:${deudorId}:${mes.slice(0, 7)}`;

export interface Neteo {
  a: string;
  b: string;
  /** Lo que se cancela en las dos direcciones. */
  monto: number;
}

/** Los pares que se deben en las dos direcciones (mejora 63): lo que se puede netear es el menor de los dos saldos. */
export function neteosPosibles(saldos: SaldoPar[]): Neteo[] {
  const m = new Map(saldos.map((s) => [clavePar(s.acreedorId, s.deudorId), s.saldo]));
  const salida: Neteo[] = [];
  for (const s of saldos) {
    if (s.acreedorId > s.deudorId) continue;
    const ida = s.saldo;
    const vuelta = m.get(clavePar(s.deudorId, s.acreedorId)) ?? 0;
    const monto = r2(Math.min(ida, vuelta));
    if (monto >= 0.01) salida.push({ a: s.acreedorId, b: s.deudorId, monto });
  }
  return salida.sort((x, y) => y.monto - x.monto);
}

export interface AbonoAplicado {
  abonoId: string;
  fecha: string;
  monto: number;
}

/**
 * A qué cargo pagó cada abono (mejora 70): por par, los abonos van primero a lo que vence antes (como `pendientes`).
 * Devuelve, por cargo, los abonos que lo pagaron.
 */
export function abonosPorCargo(movs: MovGrupo[]): Map<string, AbonoAplicado[]> {
  const porPar = new Map<string, MovGrupo[]>();
  for (const x of movs.filter(esDeuda)) {
    const k = clavePar(x.acreedorId, x.deudorId);
    porPar.set(k, [...(porPar.get(k) ?? []), x]);
  }
  const salida = new Map<string, AbonoAplicado[]>();
  for (const lista of porPar.values()) {
    const abonos = lista.filter((x) => x.tipo === "abono").sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id)).map((x) => ({ ...x, resto: x.monto }));
    const cargos = lista
      .filter((x) => x.tipo !== "abono")
      .sort((a, b) => (a.vence ?? a.fecha).localeCompare(b.vence ?? b.fecha) || a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    let j = 0;
    for (const c of cargos) {
      let falta = c.monto;
      const aplicados: AbonoAplicado[] = [];
      while (falta > 0.005 && j < abonos.length) {
        const ab = abonos[j];
        const usa = Math.min(ab.resto, falta);
        aplicados.push({ abonoId: ab.id, fecha: ab.fecha, monto: r2(usa) });
        ab.resto -= usa;
        falta -= usa;
        if (ab.resto <= 0.005) j++;
      }
      salida.set(c.id, aplicados);
    }
  }
  return salida;
}

export interface HistorialPrestamo {
  prestamo: MovGrupo;
  /** Costos del mismo par y las mismas órdenes (comisión, interés, retorno del financista). */
  costos: MovGrupo[];
  abonos: AbonoAplicado[];
  pagado: number;
  pendiente: number;
  costoTotal: number;
  /** Costo sobre el capital (0–1). */
  costoPct: number | null;
}

/** El historial de un préstamo (mejora 70): su costo con las mismas órdenes, los abonos que lo pagaron y lo pendiente. */
export function historialPrestamo(movs: MovGrupo[], id: string, aplicados = abonosPorCargo(movs)): HistorialPrestamo | null {
  const p = movs.find((m) => m.id === id && m.tipo === "prestamo");
  if (!p) return null;
  const costos = p.ordenes.length
    ? movs.filter((m) => m.tipo === "costo" && m.acreedorId === p.acreedorId && m.deudorId === p.deudorId && m.ordenes.join() === p.ordenes.join())
    : [];
  const abonos = aplicados.get(p.id) ?? [];
  const pagado = r2(abonos.reduce((a, x) => a + x.monto, 0));
  const costoTotal = r2(costos.reduce((a, x) => a + x.monto, 0));
  return { prestamo: p, costos, abonos, pagado, pendiente: r2(Math.max(0, p.monto - pagado)), costoTotal, costoPct: p.monto > 0 ? costoTotal / p.monto : null };
}

/**
 * Cuánto se ahorra al prepagar hoy un préstamo de un financista (mejora 66), si su costo corre por días: el costo del ciclo
 * (monto × tasa) por la parte del plazo que todavía no corrió. Null sin tasa, sin vencimiento o ya vencido.
 */
export function ahorroPrepago(c: Pick<CargoPendiente, "fecha" | "vence" | "pendiente" | "tipo">, tasaCiclo: number | null, hoy: string): number | null {
  if (c.tipo !== "prestamo" || !c.vence || !tasaCiclo || tasaCiclo <= 0) return null;
  const plazo = dias(c.fecha, c.vence);
  const faltan = dias(hoy, c.vence);
  if (plazo <= 0 || faltan <= 0) return null;
  return r2(c.pendiente * tasaCiclo * Math.min(1, faltan / plazo));
}

export interface Confirmacion {
  id: string;
  acreedorId: string;
  deudorId: string;
  fechaCorte: string;
  saldoAcreedor: number | null;
  saldoDeudor: number | null;
  nota: string | null;
}

export interface ConciliacionPar extends Confirmacion {
  /** Lo que dice el portal que `deudor` le debe a `acreedor` (neto) a la fecha de corte. */
  sistema: number;
  difAcreedor: number | null;
  difDeudor: number | null;
  cuadra: boolean;
}

/** Tolerancia para dar por cuadrado un saldo confirmado (mejora 68). */
export const TOLERANCIA_CONFIRMACION = 1;

/** Cada confirmación contra el saldo del portal a su fecha de corte. */
export function conciliarConfirmaciones(movs: MovGrupo[], confs: Confirmacion[]): ConciliacionPar[] {
  return confs
    .map((c) => {
      const sistema = saldoNetoAl(movs, c.acreedorId, c.deudorId, c.fechaCorte);
      const difAcreedor = c.saldoAcreedor === null ? null : r2(c.saldoAcreedor - sistema);
      const difDeudor = c.saldoDeudor === null ? null : r2(c.saldoDeudor - sistema);
      const cuadra = [difAcreedor, difDeudor].every((d) => d === null || Math.abs(d) <= TOLERANCIA_CONFIRMACION);
      return { ...c, sistema, difAcreedor, difDeudor, cuadra };
    })
    .sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte));
}
