// Lectura de los Excel de nómina (lógica pura: recibe las hojas ya leídas como filas, ver `hoja.ts`).
//
//  * PLANILLA_FORMAL_PANAMA.xlsx: una hoja por mes («NOVIEMBRE 2025» … «OCTUBRE 2026»); cada hoja trae una guía arriba
//    y dos bloques con su fila de títulos (1ª y 2ª quincena). Las columnas cambian de lugar y de nombre entre meses
//    (desde marzo hay «FECHA DE COLUMINACION», tardanzas y descuentos; desde abril «DESCUENTO APLICADO»): se ubican
//    por nombre. «PLANILLA NOMINA» (la plantilla vieja) y «CALCULOS» no son meses y se ignoran.
//  * NOMINA_EXTRANJERA.xlsx: una hoja por mes, una fila por pago; abajo, totales por tienda, «TOTAL USDT PAGADO»,
//    «COMISION P2P / BINANCE» y «TOTAL USDT CON COMISION». Las horas extra vienen como número o como hora («17:35»).
//
// Cada fila se recalcula con las fórmulas de `calculos.ts`; las que no dan lo mismo que el Excel quedan en `noCuadran`
// (sin nombres: hoja y fila). Prueba en `excel.test.ts`.

import { huella } from "../finanzas/libro-excel";
import { calcularExterna, calcularFormal, cuadra, HORAS_MES, type CalculoFormal } from "./calculos";

export type Celda = string | number | boolean | null;
export type TipoNomina = "formal" | "externa";

export interface LineaExcel {
  /** Hoja y fila del Excel (1 = primera), solo para los avisos. */
  hoja: string;
  fila: number;
  tipo: TipoNomina;
  periodo: string;
  tramo: string;
  // Persona
  clave: string;
  nombre: string;
  documento: string | null;
  nacionalidad: string | null;
  pais: string | null;
  numero_empleado: string | null;
  cargo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estatus: string | null;
  correo: string | null;
  frecuencia: string | null;
  /** Tienda de la línea (nombre de `fin_unidades`); null = la de la persona. */
  unidad: string | null;
  /** Tienda que se le pone a la persona al crearla. */
  unidad_persona: string | null;
  moneda: "USD" | "USDT";
  salario_mensual: number | null;
  hora_rata: number | null;
  horas_trabajadas: number | null;
  devengado: number;
  horas_extra: number;
  monto_horas_extra: number;
  monto_feriado: number;
  bono: number;
  descuento_tardanza: number;
  descuento_ausencia: number;
  otros_descuentos: number;
  total_bruto: number;
  seguro_social: number;
  seguro_educativo: number;
  neto: number;
  pagado: boolean | null;
  fecha_pago: string | null;
  medio_pago: string | null;
  referencia: string | null;
  origen_pago: string | null;
  tipo_pago: string | null;
  observacion: string | null;
  diferencia_calculo: number;
  origen_clave: string;
}

export interface PeriodoExcel {
  periodo: string;
  tipo: TipoNomina;
  comision: number;
  /** La fila de totales del Excel; null si no la trae o tiene un error (#REF!). */
  total_excel: number | null;
  /** Suma de las líneas leídas (lo que paga cada persona). */
  suma_lineas: number;
  lineas: number;
}

export interface NoCuadra {
  hoja: string;
  fila: number;
  campo: string;
  excel: number;
  calculado: number;
}

export interface Descartada {
  hoja: string;
  fila: number;
  motivo: string;
}

export interface LecturaNomina {
  tipo: TipoNomina;
  lineas: LineaExcel[];
  periodos: PeriodoExcel[];
  noCuadran: NoCuadra[];
  descartadas: Descartada[];
  hojasLeidas: string[];
  hojasIgnoradas: string[];
}

// ---------------------------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------------------------

/** Mayúsculas, sin acentos y solo letras y números separados por un espacio: «N° de empleado» → «N DE EMPLEADO». */
export const normal = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** La clave de una persona: su nombre normalizado («Carmen  Delgado» = «CARMEN DELGADO»). */
export const claveNombre = (nombre: string) => normal(nombre);

const r2 = (v: number) => Math.round(v * 100) / 100;

export function texto(v: Celda): string | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    // Un número de transacción de 18 cifras no cabe en un double sin perder la notación: se escribe entero.
    return Number.isInteger(v) ? BigInt(v).toString() : String(v);
  }
  const s = v.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

const DURACION = /^(\d{1,4}):([0-5]\d)(?::([0-5]\d))?$/;

/** Un número (o un texto numérico); una hora «2:12» no es un número aquí. */
export function numero(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export const esDuracion = (v: Celda) => typeof v === "string" && DURACION.test(v.trim());

/** Horas: un número tal cual o una hora «2:12» / «26:58:00» → 2,2 / 26,97. */
export function horas(v: Celda): number | null {
  if (typeof v === "string") {
    const m = v.trim().match(DURACION);
    if (m) return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600;
  }
  return numero(v);
}

/** Fecha «AAAA-MM-DD» (o serie de Excel); otra cosa, null. */
export function fecha(v: Celda): string | null {
  if (typeof v === "number" && v > 20_000 && v < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86_400_000)).toISOString().slice(0, 10);
  }
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** «MARZO 2026» → «2026-03-01»; una hoja que no se llama así no es un mes. */
export function periodoDeHoja(nombre: string): string | null {
  const m = normal(nombre).match(/^([A-Z]+) (\d{4})$/);
  if (!m) return null;
  const mes = MESES.indexOf(m[1] === "SETIEMBRE" ? "SEPTIEMBRE" : m[1]);
  return mes < 0 ? null : `${m[2]}-${String(mes + 1).padStart(2, "0")}-01`;
}

/** Cómo la nómina nombra las tiendas → el nombre en `fin_unidades`. Lo que no esté aquí se deja como viene. */
const TIENDAS: Record<string, string> = {
  OFERFY: "OFERFY PAN",
  "OFERFY PAN": "OFERFY PAN",
  NUVO: "NUVO PAN",
  "NUVO PAN": "NUVO PAN",
  KENKU: "KENKU",
  ECOMFIVE: "ECOMFIVE",
  CALZADOS: "CALZADOS O.",
  "CALZADOS O": "CALZADOS O.",
  CLICKSI: "CLICKSI",
  "NUVO CR": "NUVO COSTA RICA",
  "NUVO COSTA RICA": "NUVO COSTA RICA",
  "KENKU CR": "COSTA RICA",
  "COSTA RICA": "COSTA RICA",
  // «Global prorrateado»: lo pagó la empresa para todas las tiendas.
  GLOBAL: "A DISTRIBUIR",
  "A DISTRIBUIR": "A DISTRIBUIR",
  CORPORATIVO: "CORPORATIVO",
};

export const UNIDAD_REPARTO = "A DISTRIBUIR";

export function mapearTienda(v: Celda): string | null {
  const t = texto(v);
  if (!t) return null;
  return TIENDAS[normal(t)] ?? t.toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------------------------

type Def = { exacto?: string[]; prefijo?: string[] };

function ubicar<K extends string>(fila: Celda[], defs: Record<K, Def>): Partial<Record<K, number>> {
  const nombres = fila.map((c) => normal(c));
  const usados = new Set<number>();
  const salida: Partial<Record<K, number>> = {};
  // Primero los exactos (para que «HORAS EXTRAS» no se quede con «TOTAL HORAS EXTRAS 2»), después los prefijos.
  for (const pasada of ["exacto", "prefijo"] as const) {
    for (const [campo, def] of Object.entries(defs) as [K, Def][]) {
      if (salida[campo] !== undefined) continue;
      const opciones = def[pasada] ?? [];
      const idx = nombres.findIndex((n, i) => !usados.has(i) && n !== "" && opciones.some((o) => (pasada === "exacto" ? n === o : n.startsWith(o))));
      if (idx >= 0) {
        salida[campo] = idx;
        usados.add(idx);
      }
    }
  }
  return salida;
}

const DEF_FORMAL = {
  numero: { exacto: ["N DE EMPLEADO", "NO DE EMPLEADO", "N EMPLEADO", "NUMERO DE EMPLEADO"] },
  documento: { prefijo: ["CEDULA", "PASAPORTE", "DOCUMENTO"] },
  nacionalidad: { exacto: ["NAC", "NACIONALIDAD"] },
  nombre: { exacto: ["NOMBRE COMPLETO"] },
  cargo: { exacto: ["CARGO"] },
  fecha_inicio: { exacto: ["FECHA DE INICIO"] },
  fecha_fin: { prefijo: ["FECHA DE CULMINACION", "FECHA DE COLUMINACION", "FECHA FIN", "FECHA DE TERMINACION"] },
  estatus: { exacto: ["ESTATUS"] },
  salario: { exacto: ["SALARIO MENSUAL"] },
  horas_mes: { exacto: ["HORA POR MES", "HORAS POR MES"] },
  hora_rata: { exacto: ["HORA RATA"] },
  horas_trabajadas: { exacto: ["HORAS TRABAJADAS"] },
  horas_extra: { exacto: ["HORAS EXTRAS", "HORAS EXTRA"] },
  monto_he: { exacto: ["TOTAL HORAS EXTRAS"] },
  tardanzas: { exacto: ["TARDANZAS", "TARDANZA"] },
  ausencias: { exacto: ["AUSENCIAS", "AUSENCIA"] },
  desc_tardanza: { exacto: ["DESCUENTO TARDANZA"] },
  desc_ausencia: { exacto: ["DESCUENTO AUSENCIA"] },
  desc_aplicado: { exacto: ["DESCUENTO APLICADO"] },
  feriado: { exacto: ["FERIADO TRABAJADO"] },
  horas_feriado: { exacto: ["HORA EXTRA EN FERIADO", "HORAS EXTRA EN FERIADO"] },
  monto_he_feriado: { exacto: ["TOTAL HORAS EXTRAS 2", "TOTAL HORAS EXTRAS FERIADO"] },
  bono: { exacto: ["BONO"] },
  bruto: { prefijo: ["TOTAL ASIGNACIONES"] },
  css: { prefijo: ["SEGURO SOCIAL"] },
  se: { prefijo: ["SEGURO EDUCATIVO"] },
  neto: { prefijo: ["SALARIO NETO"] },
  observacion: { prefijo: ["OBSERVACION"] },
} satisfies Record<string, Def>;

const DEF_EXTERNA = {
  nombre: { exacto: ["NOMBRE COMPLETO"] },
  pais: { exacto: ["PAIS"] },
  rol: { prefijo: ["ROL"] },
  correo: { exacto: ["CORREO", "CORREO ELECTRONICO"] },
  frecuencia: { prefijo: ["FRECUENCIA"] },
  tramo: { prefijo: ["PERIODO CUBIERTO", "PERIODO"] },
  tienda: { exacto: ["TIENDA"] },
  sueldo: { prefijo: ["SUELDO"] },
  horas: { exacto: ["HORA EXTRA", "HORAS EXTRA", "HORAS EXTRAS"] },
  hora_normal: { prefijo: ["HORA NORMAL"] },
  monto_he: { prefijo: ["MONTO HORAS EXTRA"] },
  bono: { prefijo: ["BONO"] },
  total: { prefijo: ["TOTAL USDT", "TOTAL"] },
  tipo_pago: { exacto: ["TIPO DE PAGO"] },
  fecha_pago: { exacto: ["FECHA DE PAGO"] },
  medio: { prefijo: ["MEDIO DE PAGO"] },
  referencia: { prefijo: ["TRANSACTION ID", "ID DE TRANSACCION", "REFERENCIA"] },
  pagado: { exacto: ["PAGADO"] },
  origen_pago: { prefijo: ["ORIGEN DEL PAGO"] },
  observacion: { prefijo: ["OBSERVACION"] },
} satisfies Record<string, Def>;

const esTitulosFormal = (f: Celda[]) => {
  const n = f.map(normal);
  return n.includes("NOMBRE COMPLETO") && n.includes("SALARIO MENSUAL");
};
const esTitulosExterna = (f: Celda[]) => {
  const n = f.map(normal);
  return n.includes("NOMBRE COMPLETO") && n.some((x) => x.startsWith("TOTAL") && x.includes("USDT"));
};

/** Qué nómina es un libro: la planilla formal (salario mensual) o la externa (total USDT). */
export function detectarTipo(hojas: { filas: Celda[][] }[]): TipoNomina | null {
  for (const h of hojas) {
    for (const f of h.filas.slice(0, 40)) {
      if (esTitulosFormal(f)) return "formal";
      if (esTitulosExterna(f)) return "externa";
    }
  }
  return null;
}

/** Huella estable de una línea: tipo, mes, tramo y persona, más un ordinal para los pagos repetidos. */
function claveDeLinea(vistas: Map<string, number>, tipo: TipoNomina, periodo: string, tramo: string, clave: string): string {
  const contenido = [tipo, periodo, normal(tramo), clave].join("|");
  const ordinal = (vistas.get(contenido) ?? 0) + 1;
  vistas.set(contenido, ordinal);
  return `${huella(contenido)}#${ordinal}`;
}

const siNo = (v: Celda): boolean | null => {
  const n = normal(v);
  if (n === "SI" || n === "S") return true;
  if (n === "NO" || n === "N") return false;
  return null;
};

// ---------------------------------------------------------------------------------------------
// Planilla formal
// ---------------------------------------------------------------------------------------------

const TRAMOS = ["1ª quincena", "2ª quincena"];

/** «SALARIO LO CUBRE ECOMFIVE» → ECOMFIVE: la tienda que paga a la persona. */
export function tiendaDeObservacion(obs: string | null): string | null {
  const m = obs ? normal(obs).match(/\bCUBRE (?:LA TIENDA )?([A-Z0-9]+(?: (?:PAN|CR))?)/) : null;
  // Solo una tienda conocida: el resto de la observación es texto libre.
  return m && TIENDAS[m[1]] ? TIENDAS[m[1]] : null;
}

export function leerPlanillaFormal(hojas: { nombre: string; filas: Celda[][] }[]): LecturaNomina {
  const lineas: LineaExcel[] = [];
  const periodos: PeriodoExcel[] = [];
  const noCuadran: NoCuadra[] = [];
  const descartadas: Descartada[] = [];
  const hojasLeidas: string[] = [];
  const hojasIgnoradas: string[] = [];
  const vistas = new Map<string, number>();

  for (const { nombre: hoja, filas } of hojas) {
    const periodo = periodoDeHoja(hoja);
    const titulos = filas.map((f, i) => (esTitulosFormal(f) ? i : -1)).filter((i) => i >= 0);
    if (!periodo || !titulos.length) {
      hojasIgnoradas.push(hoja);
      continue;
    }
    hojasLeidas.push(hoja);
    let suma = 0;
    let cuantas = 0;
    titulos.forEach((t, bloque) => {
      const c = ubicar(filas[t], DEF_FORMAL);
      const tramo = TRAMOS[bloque] ?? `Bloque ${bloque + 1}`;
      const fin = titulos[bloque + 1] ?? filas.length;
      const celda = (f: Celda[], k: keyof typeof DEF_FORMAL): Celda => (c[k] === undefined ? null : (f[c[k]!] ?? null));
      for (let i = t + 1; i < fin; i++) {
        const f = filas[i];
        const nombre = texto(celda(f, "nombre"));
        if (!nombre || typeof celda(f, "nombre") !== "string") continue;
        if (normal(nombre).includes("TOTAL")) continue;
        const r = lineaFormal(f, celda, { hoja, fila: i + 1, periodo, tramo, nombre });
        if ("motivo" in r) {
          descartadas.push({ hoja, fila: i + 1, motivo: r.motivo });
          continue;
        }
        noCuadran.push(...r.noCuadran);
        lineas.push({ ...r.linea, origen_clave: claveDeLinea(vistas, "formal", periodo, tramo, r.linea.clave) });
        suma += r.linea.neto;
        cuantas++;
      }
    });
    // La planilla no tiene fila de totales: se compara fila por fila con las fórmulas.
    periodos.push({ periodo, tipo: "formal", comision: 0, total_excel: null, suma_lineas: r2(suma), lineas: cuantas });
  }
  // La tienda de cada persona: la que más veces dice su observación («SALARIO LO CUBRE ECOMFIVE»); si nunca lo dice, el
  // sueldo es de todas las tiendas (A DISTRIBUIR, como lo carga el libro).
  const conteo = new Map<string, Map<string, number>>();
  for (const l of lineas) {
    if (!l.unidad) continue;
    const m = conteo.get(l.clave) ?? new Map<string, number>();
    m.set(l.unidad, (m.get(l.unidad) ?? 0) + 1);
    conteo.set(l.clave, m);
  }
  for (const l of lineas) {
    const m = conteo.get(l.clave);
    l.unidad_persona = m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : UNIDAD_REPARTO;
  }
  return { tipo: "formal", lineas, periodos, noCuadran, descartadas, hojasLeidas, hojasIgnoradas };
}

function lineaFormal(
  f: Celda[],
  celda: (f: Celda[], k: keyof typeof DEF_FORMAL) => Celda,
  ctx: { hoja: string; fila: number; periodo: string; tramo: string; nombre: string },
): { motivo: string } | { linea: Omit<LineaExcel, "origen_clave">; noCuadran: NoCuadra[] } {
  const n = (k: keyof typeof DEF_FORMAL) => numero(celda(f, k));
  const salario = n("salario");
  const horasMes = n("horas_mes") ?? HORAS_MES;
  const rataExcel = n("hora_rata");
  const horasTrabajadas = horas(celda(f, "horas_trabajadas")) ?? 0;
  const horasExtra = horas(celda(f, "horas_extra")) ?? 0;
  // Tardanza: un número son minutos (guía rápida); una hora «2:38» es tiempo.
  const tard = celda(f, "tardanzas");
  const tardanzaHoras = esDuracion(tard) ? (horas(tard) ?? 0) : (numero(tard) ?? 0) / 60;
  // Ausencia: un número son días; una hora es tiempo.
  const aus = celda(f, "ausencias");
  const ausenciaHoras = esDuracion(aus) ? (horas(aus) ?? 0) : 0;
  const ausenciaDias = esDuracion(aus) ? 0 : (numero(aus) ?? 0);
  const montoFeriado = n("feriado") ?? 0;
  const horasFeriado = horas(celda(f, "horas_feriado")) ?? 0;
  const montoHEFeriado = n("monto_he_feriado") ?? 0;
  const bono = n("bono") ?? 0;
  const descuentoAplicado = Math.abs(n("desc_aplicado") ?? 0);
  const seguroSocial = n("css") ?? 0;
  const seguroEducativo = n("se") ?? 0;
  let bruto = n("bruto");
  let neto = n("neto");
  if (bruto === null && neto === null) return { motivo: "sin montos" };
  if (salario === null) return { motivo: "sin salario mensual" };
  bruto ??= (neto ?? 0) + seguroSocial + seguroEducativo;
  neto ??= bruto - seguroSocial - seguroEducativo;

  const entrada = {
    salarioMensual: salario,
    horasMes,
    horasTrabajadas,
    horasExtra,
    tardanzaHoras,
    ausenciaDias,
    ausenciaHoras,
    montoFeriado,
    horasExtraFeriado: horasFeriado,
    montoHorasExtraFeriado: montoHEFeriado,
    bono,
    descuentoAplicado,
    aplicaSeguros: seguroSocial > 0 || seguroEducativo > 0,
  };
  const antes = calcularFormal({ ...entrada, descuentoAntesDeSeguros: true });
  const despues = calcularFormal({ ...entrada, descuentoAntesDeSeguros: false });
  // El descuento aplicado se restó antes o después de los seguros según el mes: vale el que da lo del Excel.
  const puntos = (x: CalculoFormal) => Number(cuadra(x.totalBruto, bruto!)) + Number(cuadra(x.neto, neto!));
  const calc: CalculoFormal = descuentoAplicado > 0 && puntos(despues) > puntos(antes) ? despues : antes;
  const noCuadran: NoCuadra[] = [];
  if (!cuadra(calc.totalBruto, bruto)) noCuadran.push({ hoja: ctx.hoja, fila: ctx.fila, campo: "total asignaciones", excel: r2(bruto), calculado: calc.totalBruto });
  if (!cuadra(calc.neto, neto)) noCuadran.push({ hoja: ctx.hoja, fila: ctx.fila, campo: "salario neto", excel: r2(neto), calculado: calc.neto });

  const rata = rataExcel ?? calc.horaRata;
  const observacion = texto(celda(f, "observacion"));
  const documento = texto(celda(f, "documento"));
  return {
    noCuadran,
    linea: {
      hoja: ctx.hoja,
      fila: ctx.fila,
      tipo: "formal",
      periodo: ctx.periodo,
      tramo: ctx.tramo,
      clave: claveNombre(ctx.nombre),
      nombre: ctx.nombre,
      documento: documento && documento !== "-" ? documento : null,
      nacionalidad: texto(celda(f, "nacionalidad")),
      pais: null,
      numero_empleado: texto(celda(f, "numero")),
      cargo: texto(celda(f, "cargo")),
      fecha_inicio: fecha(celda(f, "fecha_inicio")),
      fecha_fin: fecha(celda(f, "fecha_fin")),
      estatus: texto(celda(f, "estatus")),
      correo: null,
      frecuencia: "QUINCENAL",
      // Solo si la observación dice quién lo paga; si no, vale la tienda de la persona.
      unidad: tiendaDeObservacion(observacion),
      unidad_persona: UNIDAD_REPARTO,
      moneda: "USD",
      salario_mensual: r2(salario),
      hora_rata: Math.round(rata * 1e6) / 1e6,
      horas_trabajadas: r2(horasTrabajadas),
      devengado: r2(rata * horasTrabajadas),
      horas_extra: r2(horasExtra),
      monto_horas_extra: r2(n("monto_he") ?? calc.montoHorasExtra),
      monto_feriado: r2(montoFeriado + (montoHEFeriado || calc.montoHorasExtraFeriado)),
      bono: r2(bono),
      descuento_tardanza: r2(Math.abs(n("desc_tardanza") ?? calc.descuentoTardanza)),
      descuento_ausencia: r2(Math.abs(n("desc_ausencia") ?? calc.descuentoAusencia)),
      otros_descuentos: r2(descuentoAplicado),
      total_bruto: r2(bruto),
      seguro_social: r2(seguroSocial),
      seguro_educativo: r2(seguroEducativo),
      neto: r2(neto),
      pagado: null,
      fecha_pago: null,
      medio_pago: null,
      referencia: null,
      origen_pago: null,
      tipo_pago: null,
      observacion,
      diferencia_calculo: cuadra(calc.neto, neto) ? 0 : r2(calc.neto - neto),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Nómina externa (USDT)
// ---------------------------------------------------------------------------------------------

/** El período cubierto como se lee: una fecha va «15/06/2026»; un texto, tal cual. */
function tramoExterno(v: Celda, frecuencia: string | null): string {
  const d = fecha(v);
  if (d) return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return texto(v) ?? (frecuencia ? frecuencia.toLowerCase() : "");
}

export function leerNominaExterna(hojas: { nombre: string; filas: Celda[][] }[]): LecturaNomina {
  const lineas: LineaExcel[] = [];
  const periodos: PeriodoExcel[] = [];
  const noCuadran: NoCuadra[] = [];
  const descartadas: Descartada[] = [];
  const hojasLeidas: string[] = [];
  const hojasIgnoradas: string[] = [];
  const vistas = new Map<string, number>();

  for (const { nombre: hoja, filas } of hojas) {
    const periodo = periodoDeHoja(hoja);
    const t = filas.slice(0, 15).findIndex(esTitulosExterna);
    if (!periodo || t < 0) {
      hojasIgnoradas.push(hoja);
      continue;
    }
    hojasLeidas.push(hoja);
    const c = ubicar(filas[t], DEF_EXTERNA);
    const celda = (f: Celda[], k: keyof typeof DEF_EXTERNA): Celda => (c[k] === undefined ? null : (f[c[k]!] ?? null));
    let comision = 0;
    let totalExcel: number | null = null;
    let suma = 0;
    let cuantas = 0;
    for (let i = t + 1; i < filas.length; i++) {
      const f = filas[i];
      const nombre = texto(celda(f, "nombre"));
      if (!nombre || typeof celda(f, "nombre") !== "string") continue;
      const n = normal(nombre);
      if (n.startsWith("COMISION")) {
        comision += numero(celda(f, "total")) ?? 0;
        continue;
      }
      if (n.includes("TOTAL")) {
        if (n.startsWith("TOTAL USDT") && !n.includes("COMISION")) totalExcel = numero(celda(f, "total"));
        continue; // totales por tienda y generales
      }
      const sueldo = numero(celda(f, "sueldo")) ?? 0;
      const horasExtra = horas(celda(f, "horas")) ?? 0;
      const horaNormal = numero(celda(f, "hora_normal"));
      const montoHE = numero(celda(f, "monto_he"));
      const bono = numero(celda(f, "bono")) ?? 0;
      let total = numero(celda(f, "total"));
      if (total === null && sueldo === 0 && bono === 0) {
        descartadas.push({ hoja, fila: i + 1, motivo: "sin montos" });
        continue;
      }
      const calc = calcularExterna({ sueldo, horasExtra, horaNormal, bono });
      total ??= calc.total;
      if (montoHE !== null && !cuadra(calc.montoHorasExtra, montoHE)) {
        noCuadran.push({ hoja, fila: i + 1, campo: "monto horas extra", excel: r2(montoHE), calculado: calc.montoHorasExtra });
      }
      const totalCalc = r2(sueldo + (montoHE ?? calc.montoHorasExtra) + bono);
      if (!cuadra(totalCalc, total)) noCuadran.push({ hoja, fila: i + 1, campo: "total USDT", excel: r2(total), calculado: totalCalc });
      const frecuencia = texto(celda(f, "frecuencia"));
      const tramo = tramoExterno(celda(f, "tramo"), frecuencia);
      const clave = claveNombre(nombre);
      const unidad = mapearTienda(celda(f, "tienda"));
      lineas.push({
        hoja,
        fila: i + 1,
        tipo: "externa",
        periodo,
        tramo,
        clave,
        nombre,
        documento: null,
        nacionalidad: null,
        pais: texto(celda(f, "pais")),
        numero_empleado: null,
        cargo: texto(celda(f, "rol")),
        fecha_inicio: null,
        fecha_fin: null,
        estatus: null,
        correo: texto(celda(f, "correo"))?.toLowerCase() ?? null,
        frecuencia,
        unidad,
        unidad_persona: unidad,
        moneda: "USDT",
        salario_mensual: normal(frecuencia) === "MENSUAL" ? r2(sueldo) : null,
        hora_rata: horaNormal === null ? null : Math.round(horaNormal * 1e6) / 1e6,
        horas_trabajadas: null,
        devengado: r2(sueldo),
        horas_extra: r2(horasExtra),
        monto_horas_extra: r2(montoHE ?? calc.montoHorasExtra),
        monto_feriado: 0,
        bono: r2(bono),
        descuento_tardanza: 0,
        descuento_ausencia: 0,
        otros_descuentos: 0,
        total_bruto: r2(total),
        seguro_social: 0,
        seguro_educativo: 0,
        neto: r2(total),
        pagado: siNo(celda(f, "pagado")),
        fecha_pago: fecha(celda(f, "fecha_pago")),
        medio_pago: texto(celda(f, "medio")),
        referencia: texto(celda(f, "referencia")),
        origen_pago: texto(celda(f, "origen_pago")),
        tipo_pago: texto(celda(f, "tipo_pago")),
        observacion: texto(celda(f, "observacion")),
        diferencia_calculo: cuadra(totalCalc, total) ? 0 : r2(totalCalc - total),
        origen_clave: claveDeLinea(vistas, "externa", periodo, tramo, clave),
      });
      suma += total;
      cuantas++;
    }
    periodos.push({ periodo, tipo: "externa", comision: r2(comision), total_excel: totalExcel === null ? null : r2(totalExcel), suma_lineas: r2(suma), lineas: cuantas });
  }
  return { tipo: "externa", lineas, periodos, noCuadran, descartadas, hojasLeidas, hojasIgnoradas };
}

/** Lee el libro que sea (planilla formal o nómina externa); null si no es ninguno de los dos. */
export function leerNomina(hojas: { nombre: string; filas: Celda[][] }[]): LecturaNomina | null {
  const tipo = detectarTipo(hojas);
  if (tipo === "formal") return leerPlanillaFormal(hojas);
  if (tipo === "externa") return leerNominaExterna(hojas);
  return null;
}
