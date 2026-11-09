// Portal AF4 360° › Panel › Paquete bancario (mejora 4 de la Fase 2). Lógica pura: qué secciones lleva el paquete y en
// qué orden lo lee un comité de crédito, los indicadores clave (márgenes, días de calle, inventario y proveedores, ciclo
// de caja, deuda / EBITDA, cobertura de intereses, liquidez y capital de trabajo) con su manejo de divisiones por cero y
// signos, la concentración de ventas, los totales por año, la cartera a la fecha de corte y la lista de limitaciones (lo
// que falta en los datos: el paquete no esconde los huecos). Prueba en `paquete-bancario.test.ts`.

import { ESTADOS_ABIERTOS, estadoDe, resumirCartera, saldoDe, type DocumentoBase, type ResumenCartera } from "./cxc-cxp";
import type { InsumosBalance } from "./balance";

const r2 = (v: number) => Math.round(v * 100) / 100;
const finito = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

// ---------------------------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------------------------

/** Las secciones en el orden en que las lee un banco; cada una con el módulo que hay que poder abrir para incluirla. */
export const SECCIONES_PAQUETE = [
  { clave: "resumen", etiqueta: "Carta y resumen de la empresa", modulos: [] as string[] },
  { clave: "indicadores", etiqueta: "Indicadores clave", modulos: ["estado-resultados"] },
  { clave: "eerr", etiqueta: "Estado de resultados", modulos: ["estado-resultados"] },
  { clave: "balance", etiqueta: "Balance general", modulos: ["balance-general"] },
  { clave: "flujo", etiqueta: "Flujo de caja", modulos: ["flujo-caja"] },
  { clave: "cartera", etiqueta: "Cuentas por cobrar y por pagar", modulos: ["cuentas-por-cobrar", "cuentas-por-pagar"] },
  { clave: "deuda", etiqueta: "Deuda vigente", modulos: ["tesoreria"] },
  { clave: "proyeccion", etiqueta: "Proyección de caja", modulos: ["proyeccion-caja"] },
  { clave: "concentracion", etiqueta: "Concentración de ventas", modulos: ["estado-resultados"] },
  { clave: "notas", etiqueta: "Notas a los estados financieros", modulos: [] as string[] },
  { clave: "limitaciones", etiqueta: "Limitaciones", modulos: [] as string[] },
] as const;

export type SeccionPaquete = (typeof SECCIONES_PAQUETE)[number]["clave"];

export const esSeccionPaquete = (v: unknown): v is SeccionPaquete => typeof v === "string" && SECCIONES_PAQUETE.some((s) => s.clave === v);
export const etiquetaSeccion = (s: SeccionPaquete) => SECCIONES_PAQUETE.find((x) => x.clave === s)!.etiqueta;

/** Las secciones que esta persona puede incluir: basta con poder abrir uno de sus módulos. */
export function seccionesPermitidas(modulos: string[]): SeccionPaquete[] {
  return SECCIONES_PAQUETE.filter((s) => s.modulos.length === 0 || s.modulos.some((m) => modulos.includes(m))).map((s) => s.clave);
}

/**
 * Las secciones pedidas (`?secciones=a,b` o una lista), en el orden del paquete y solo entre las permitidas. Sin pedir
 * ninguna (o nada válido), todas las permitidas. «Limitaciones» va siempre: el paquete no se arma sin decir qué le falta.
 */
export function leerSecciones(v: unknown, permitidas: SeccionPaquete[] = SECCIONES_PAQUETE.map((s) => s.clave)): SeccionPaquete[] {
  const crudas = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const pedidas = new Set(crudas.map((x) => String(x).trim()).filter(esSeccionPaquete));
  const elegidas = pedidas.size ? permitidas.filter((s) => pedidas.has(s)) : [...permitidas];
  if (!elegidas.includes("limitaciones")) elegidas.push("limitaciones");
  return SECCIONES_PAQUETE.map((s) => s.clave).filter((s) => elegidas.includes(s));
}

// ---------------------------------------------------------------------------------------------
// Carta, entidad y corte
// ---------------------------------------------------------------------------------------------

export const MAX_CARTA = 8000;

/** La carta: texto con el formato simple de los manuales (nunca HTML). Sin caracteres de control; hasta 8 000. */
export function leerCarta(v: unknown): { texto: string } | { error: string } {
  if (v === null || v === undefined) return { texto: "" };
  if (typeof v !== "string") return { error: "La carta debe ser texto." };
  // eslint-disable-next-line no-control-regex
  const texto = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (texto.length > MAX_CARTA) return { error: `La carta admite hasta ${MAX_CARTA.toLocaleString("es-PA")} caracteres.` };
  return { texto };
}

/** La carta de partida, para editar: quién es la empresa, qué se adjunta y que las cifras son de gestión. */
export function cartaPredeterminada(empresa: string, corte: string, alcance: string): string {
  return [
    "## Presentación",
    `${empresa} presenta su información financiera al cierre de ${corte} (${alcance}) para la evaluación de una línea de crédito.`,
    "",
    "## Qué incluye",
    "- Indicadores clave de los últimos 12 meses.",
    "- Estado de resultados, balance general y flujo de caja.",
    "- Antigüedad de la cartera, deuda vigente y proyección de caja.",
    "",
    "## Uso de los fondos",
    "- Describir aquí el monto solicitado, el destino y el plazo.",
    "",
    "Las cifras son de gestión y no están auditadas. La sección «Limitaciones» detalla lo que falta en los datos.",
  ].join("\n");
}

/** La entidad pedida: «consolidado» o un código de entidad (PA, CR). */
export function leerEntidad(v: unknown, codigos: string[]): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return codigos.includes(s) ? s : "consolidado";
}

/** «AAAA-MM-01» + n meses. */
export function moverMes(periodo: string, n: number): string {
  const total = Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1 + n;
  const anio = Math.floor(total / 12);
  return `${anio}-${String(total - anio * 12 + 1).padStart(2, "0")}-01`;
}

/** Los `n` meses que terminan en `corte`, del más viejo al más nuevo. */
export const mesesHasta = (corte: string, n: number): string[] => Array.from({ length: n }, (_, i) => moverMes(corte, i - n + 1));

/**
 * La fecha de corte por defecto: el último mes cerrado en Cierre de mes antes del mes en curso; sin cierres, el mes
 * anterior al de hoy (el mes en curso nunca: todavía está abierto).
 */
export function corteSugerido(mesEnCurso: string, cerrados: string[]): string {
  const validos = cerrados.map((c) => `${c.slice(0, 7)}-01`).filter((c) => c < mesEnCurso).sort();
  return validos.at(-1) ?? moverMes(mesEnCurso, -1);
}

/** Los meses que se ofrecen como corte: los 24 anteriores al mes en curso, desde el inicio del libro. */
export function cortesDisponibles(mesEnCurso: string, inicioLibro: string | null, n = 24): string[] {
  return mesesHasta(moverMes(mesEnCurso, -1), n).filter((m) => !inicioLibro || m >= `${inicioLibro.slice(0, 7)}-01`).reverse();
}

/** Los cortes del balance: el pedido y tres anteriores (hace 3, 6 y 12 meses), sin pasar del inicio del libro. */
export function cortesBalance(corte: string, inicioLibro: string | null): string[] {
  const inicio = inicioLibro ? `${inicioLibro.slice(0, 7)}-01` : null;
  return [...new Set([moverMes(corte, -12), moverMes(corte, -6), moverMes(corte, -3), corte])].filter((m) => !inicio || m >= inicio).sort();
}

// ---------------------------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------------------------

/** Cociente que no inventa: null si el divisor es cero, no es un número o alguno falta. */
export function dividir(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!finito(a) || !finito(b) || b === 0) return null;
  return a / b;
}

/** Lo que entra a los indicadores, todo en dólares y en positivo (los costos y las deudas como montos). */
export interface InsumosIndicadores {
  /** Ingresos netos de los 12 meses. */
  ventas: number;
  /** Ingresos netos de los 12 meses anteriores; null si el libro no llega tan atrás. */
  ventasAnterior: number | null;
  /** Costo de ventas de los 12 meses (positivo). */
  costoVentas: number;
  margenBruto: number;
  ebitda: number;
  /** Intereses de los 12 meses (positivo). */
  intereses: number;
  /** Al corte; null = sin dato (no se pudo leer). */
  cxc: number | null;
  inventario: number | null;
  cxp: number | null;
  caja: number;
  /** Préstamos, líneas de crédito y préstamos manuales al corte. */
  deudaFinanciera: number;
  activoCorriente: number | null;
  pasivoCorriente: number | null;
  /** Meses con datos dentro de la ventana (los días se calculan sobre esos meses). */
  mesesConDatos: number;
}

export interface IndicadoresBancarios {
  ventas: number;
  margenBruto: number;
  margenBrutoPct: number | null;
  ebitda: number;
  margenEbitdaPct: number | null;
  crecimientoPct: number | null;
  dso: number | null;
  dio: number | null;
  dpo: number | null;
  cicloCaja: number | null;
  deudaFinanciera: number;
  deudaNeta: number;
  deudaEbitda: number | null;
  deudaNetaEbitda: number | null;
  /** La deuda no se puede medir contra el EBITDA porque el EBITDA es cero o negativo y hay deuda. */
  deudaEbitdaNoSignificativa: boolean;
  coberturaIntereses: number | null;
  liquidezCorriente: number | null;
  capitalTrabajo: number | null;
}

/**
 * Los indicadores del paquete. Los días se calculan sobre los días de la ventana con datos (365 con 12 meses): DSO =
 * CxC ÷ ventas × días; DIO = inventario ÷ costo de ventas × días; DPO = CxP ÷ costo de ventas × días; ciclo = DIO + DSO
 * − DPO (solo con los tres). Deuda / EBITDA y deuda neta / EBITDA solo con EBITDA positivo; con EBITDA ≤ 0 y deuda se
 * marca «no significativo». Cobertura = EBITDA ÷ intereses, solo con intereses. Liquidez = activo ÷ pasivo corriente.
 */
export function indicadoresBancarios(i: InsumosIndicadores): IndicadoresBancarios {
  const dias = (Math.min(Math.max(i.mesesConDatos, 0), 12) / 12) * 365;
  const pct = (a: number) => (i.ventas > 0 ? (a / i.ventas) * 100 : null);
  const enDias = (saldo: number | null, base: number) => (saldo === null || base <= 0 || dias <= 0 ? null : (saldo / base) * dias);
  const dso = enDias(i.cxc, i.ventas);
  const dio = enDias(i.inventario, i.costoVentas);
  const dpo = enDias(i.cxp, i.costoVentas);
  const deudaNeta = r2(i.deudaFinanciera - i.caja);
  const conEbitda = i.ebitda > 0;
  return {
    ventas: r2(i.ventas),
    margenBruto: r2(i.margenBruto),
    margenBrutoPct: pct(i.margenBruto),
    ebitda: r2(i.ebitda),
    margenEbitdaPct: pct(i.ebitda),
    crecimientoPct: i.ventasAnterior !== null && i.ventasAnterior > 0 ? (i.ventas / i.ventasAnterior - 1) * 100 : null,
    dso,
    dio,
    dpo,
    cicloCaja: dso !== null && dio !== null && dpo !== null ? dio + dso - dpo : null,
    deudaFinanciera: r2(i.deudaFinanciera),
    deudaNeta,
    deudaEbitda: conEbitda ? i.deudaFinanciera / i.ebitda : null,
    deudaNetaEbitda: conEbitda ? deudaNeta / i.ebitda : null,
    deudaEbitdaNoSignificativa: !conEbitda && i.deudaFinanciera > 0,
    coberturaIntereses: i.intereses > 0 ? i.ebitda / i.intereses : null,
    liquidezCorriente: i.activoCorriente !== null && i.pasivoCorriente !== null && i.pasivoCorriente > 0 ? i.activoCorriente / i.pasivoCorriente : null,
    capitalTrabajo: i.activoCorriente !== null && i.pasivoCorriente !== null ? r2(i.activoCorriente - i.pasivoCorriente) : null,
  };
}

/**
 * La posición corriente de un corte del balance. Activo corriente = caja + CxC + inventario + anticipos. Pasivo
 * corriente = CxP + gastos de importación + tarjetas + lo que vence en 12 meses de la deuda + otros pasivos + los
 * préstamos manuales (sin plazo conocido: se toman como corrientes, que es lo prudente). Deuda financiera = préstamos y
 * líneas + préstamos manuales.
 */
export function posicionCorriente(i: InsumosBalance): {
  caja: number;
  cxc: number | null;
  inventario: number | null;
  cxp: number | null;
  activoCorriente: number | null;
  pasivoCorriente: number | null;
  deudaFinanciera: number;
} {
  const caja = r2(i.caja.reduce((a, c) => a + c.saldo, 0));
  const partidas = (rubro: string) => i.partidas.filter((p) => p.rubro === rubro).reduce((a, p) => a + p.monto, 0);
  const deuda = (i.deuda ?? []).reduce((a, d) => a + d.saldo, 0);
  const deudaCorriente = (i.deuda ?? []).reduce((a, d) => a + d.corriente, 0);
  const prestamosManuales = partidas("prestamo");
  const activoCorriente = i.cxc === null ? null : r2(caja + i.cxc + (i.inventario ?? 0) + (i.anticipos ?? 0));
  const pasivoCorriente =
    i.cxp === null ? null : r2(i.cxp + (i.gastosImportacion ?? 0) + Math.max(-i.tarjetas, 0) + deudaCorriente + prestamosManuales + partidas("otro_pasivo"));
  return { caja, cxc: i.cxc, inventario: i.inventario, cxp: i.cxp, activoCorriente, pasivoCorriente, deudaFinanciera: r2(deuda + prestamosManuales) };
}

/**
 * Los intereses del período desde los tipos de la sección Finanzas del EERR: los que dicen «interés» en el nombre. Si
 * ninguno lo dice, toda la sección (comisiones bancarias incluidas) y se marca como aproximado.
 */
export function interesesDeFinanzas(tipos: { tipo: string; total: number; signo: number }[]): { monto: number; aproximado: boolean } {
  const neto = (ts: typeof tipos) => r2(ts.reduce((a, t) => a + t.total * (t.signo < 0 ? 1 : -1), 0));
  const deIntereses = tipos.filter((t) => /inter[eé]s/i.test(t.tipo));
  if (deIntereses.length) return { monto: Math.max(neto(deIntereses), 0), aproximado: false };
  const todo = neto(tipos);
  return { monto: Math.max(todo, 0), aproximado: todo > 0 };
}

// ---------------------------------------------------------------------------------------------
// Concentración, años y cartera
// ---------------------------------------------------------------------------------------------

export interface Concentracion {
  filas: { nombre: string; ventas: number; parte: number }[];
  total: number;
  /** Parte de la primera y de las tres primeras (0–1). */
  primera: number;
  tresPrimeras: number;
  /** Herfindahl-Hirschman (0–10 000): sobre 2 500, concentrado. */
  hhi: number;
}

/** La concentración de las ventas por tienda o canal (solo las que vendieron), de mayor a menor. */
export function concentracionVentas(porUnidad: { nombre: string; ventas: number }[]): Concentracion {
  const positivas = porUnidad.filter((u) => u.ventas > 0);
  const total = positivas.reduce((a, u) => a + u.ventas, 0);
  const filas = positivas
    .map((u) => ({ nombre: u.nombre, ventas: r2(u.ventas), parte: total > 0 ? u.ventas / total : 0 }))
    .sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre));
  return {
    filas,
    total: r2(total),
    primera: filas[0]?.parte ?? 0,
    tresPrimeras: filas.slice(0, 3).reduce((a, f) => a + f.parte, 0),
    hhi: Math.round(filas.reduce((a, f) => a + (f.parte * 100) ** 2, 0)),
  };
}

export interface TotalAnual {
  anio: string;
  meses: number;
  ingresos: number;
  margenBruto: number;
  ebitda: number;
  resultadoNeto: number;
}

/** Los totales por año calendario (solo los meses con datos; un año incompleto dice cuántos meses lleva). */
export function totalesAnuales(
  meses: string[],
  conDatos: ReadonlySet<string>,
  series: { ingresos: Record<string, number>; margenBruto: Record<string, number>; ebitda: Record<string, number>; resultadoNeto: Record<string, number> },
): TotalAnual[] {
  const porAnio = new Map<string, TotalAnual>();
  for (const m of meses) {
    if (!conDatos.has(m)) continue;
    const anio = m.slice(0, 4);
    const t = porAnio.get(anio) ?? { anio, meses: 0, ingresos: 0, margenBruto: 0, ebitda: 0, resultadoNeto: 0 };
    t.meses++;
    t.ingresos = r2(t.ingresos + (series.ingresos[m] ?? 0));
    t.margenBruto = r2(t.margenBruto + (series.margenBruto[m] ?? 0));
    t.ebitda = r2(t.ebitda + (series.ebitda[m] ?? 0));
    t.resultadoNeto = r2(t.resultadoNeto + (series.resultadoNeto[m] ?? 0));
    porAnio.set(anio, t);
  }
  return [...porAnio.values()].sort((a, b) => a.anio.localeCompare(b.anio));
}

/**
 * La cartera como estaba al cierre del corte: solo los documentos emitidos hasta esa fecha (o sin fecha) y los abonos
 * hechos hasta esa fecha (un abono sin fecha cuenta). Un documento anulado no cuenta. La antigüedad y lo vencido se miden
 * a esa fecha.
 */
export function carteraAlCorte<D extends DocumentoBase & { contraparte: string }>(docs: D[], finDelCorte: string, top = 10): ResumenCartera {
  const vigentes = docs
    .filter((d) => d.estado_manual !== "anulado" && (!d.fecha || d.fecha <= finDelCorte))
    .map((d) => ({ ...d, abonos: d.abonos.filter((a) => !a.fecha || a.fecha <= finDelCorte) }));
  return resumirCartera(vigentes, finDelCorte, top);
}

/** Lo abierto de una cartera (para cuadrar contra el balance). */
export const saldoAbierto = (docs: DocumentoBase[]): number => r2(docs.filter((d) => ESTADOS_ABIERTOS.includes(estadoDe(d))).reduce((a, d) => a + saldoDe(d), 0));

// ---------------------------------------------------------------------------------------------
// Limitaciones
// ---------------------------------------------------------------------------------------------

export interface Limitacion {
  clave: string;
  texto: string;
  /** alta: cambia una cifra que mira el banco; media: un dato que conviene completar. */
  severidad: "alta" | "media";
}

export interface DatosLimitaciones {
  /** Diferencia por cuadrar del balance en cada corte (solo las que no son cero). */
  balanceSinCuadrar: { corte: string; diferencia: number }[];
  sinInventario: string[];
  /** Si hay saldos iniciales de caja. */
  conSaldos: boolean;
  cuentasSinSaldo: number;
  /** Meses de la ventana de 12 sin movimientos en el EERR. */
  mesesSinDatos: string[];
  movimientosSinTipo: number;
  movimientosSinTienda: number;
  /** Avisos de migraciones o lecturas que fallaron. */
  avisos: string[];
  /** El mes de corte está cerrado en Cierre de mes. */
  corteCerrado: boolean;
  /** Los intereses salen de toda la sección Finanzas (no hay un tipo de intereses). */
  interesesAproximados: boolean;
  deudaEbitdaNoSignificativa: boolean;
  /** No hay giros cargados (ni financiamientos por ciclo ni préstamos de clase Financiamiento). */
  sinRegistroGiros: boolean;
  /** La proyección parte de hoy, no del corte. */
  proyeccionDesdeHoy: boolean;
  /** Secciones elegidas que no se pudieron armar. */
  seccionesSinDatos: string[];
}

/** La lista de limitaciones del paquete. La primera siempre: cifras de gestión, no auditadas. */
export function limitacionesPaquete(d: DatosLimitaciones, fmt: (v: number) => string, mes: (m: string) => string): Limitacion[] {
  const l: Limitacion[] = [
    { clave: "no-auditadas", severidad: "alta", texto: "Cifras de gestión, no auditadas: salen del libro de movimientos y de los módulos del portal, sin revisión de un auditor externo." },
  ];
  for (const b of d.balanceSinCuadrar) l.push({ clave: `balance-${b.corte}`, severidad: "alta", texto: `El balance de ${mes(b.corte)} tiene una diferencia por cuadrar de ${fmt(b.diferencia)}.` });
  if (!d.corteCerrado) l.push({ clave: "corte-abierto", severidad: "alta", texto: "El mes de corte no está cerrado en Cierre de mes: sus cifras todavía pueden cambiar." });
  if (!d.conSaldos) l.push({ clave: "sin-saldos", severidad: "alta", texto: "Faltan los saldos iniciales de caja: la caja es solo el flujo acumulado desde el inicio del libro." });
  else if (d.cuentasSinSaldo > 0)
    l.push({ clave: "cuentas-sin-saldo", severidad: "media", texto: `${d.cuentasSinSaldo} ${d.cuentasSinSaldo === 1 ? "cuenta parte" : "cuentas parten"} de cero por no tener saldo inicial.` });
  if (d.sinInventario.length)
    l.push({ clave: "sin-inventario", severidad: "alta", texto: `Sin foto del inventario en ${d.sinInventario.map(mes).join(", ")}: el inventario de esos cortes no está valorizado.` });
  if (d.mesesSinDatos.length) l.push({ clave: "meses-sin-datos", severidad: "alta", texto: `Meses sin movimientos en el Estado de resultados: ${d.mesesSinDatos.map(mes).join(", ")}. Los totales de 12 meses los cuentan en cero.` });
  if (d.movimientosSinTipo > 0) l.push({ clave: "sin-tipo", severidad: "media", texto: `${d.movimientosSinTipo} movimientos sin tipo en los 12 meses: no entran al Estado de resultados.` });
  if (d.movimientosSinTienda > 0) l.push({ clave: "sin-tienda", severidad: "media", texto: `${d.movimientosSinTienda} movimientos sin tienda en los 12 meses: la concentración por tienda no los reparte.` });
  if (d.interesesAproximados) l.push({ clave: "intereses", severidad: "media", texto: "No hay un tipo de intereses en el libro: la cobertura usa toda la sección Finanzas (incluye comisiones bancarias)." });
  if (d.deudaEbitdaNoSignificativa) l.push({ clave: "deuda-ebitda", severidad: "alta", texto: "Con EBITDA de 12 meses cero o negativo, deuda / EBITDA no es significativo." });
  if (d.sinRegistroGiros) l.push({ clave: "giros", severidad: "media", texto: "No hay giros de financiamiento privado cargados en Tesorería › Deuda (financiamientos por ciclo ni préstamos de clase Financiamiento)." });
  if (d.proyeccionDesdeHoy) l.push({ clave: "proyeccion", severidad: "media", texto: "La proyección de caja parte de la caja de hoy, no de la fecha de corte." });
  for (const s of d.seccionesSinDatos) l.push({ clave: `seccion-${s}`, severidad: "media", texto: `«${s}» no se pudo armar con los datos disponibles.` });
  for (const a of d.avisos) l.push({ clave: `aviso-${a.slice(0, 40)}`, severidad: "media", texto: a });
  // Sin repetir el mismo texto.
  const vistos = new Set<string>();
  return l.filter((x) => (vistos.has(x.texto) ? false : (vistos.add(x.texto), true)));
}
