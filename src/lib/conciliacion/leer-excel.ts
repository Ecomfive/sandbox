// Lectura del libro de conciliación de Excel (CONCILIACIONES_DE_BANCO_*.xlsx) y de extractos en CSV. Lógica pura: recibe
// las filas ya leídas (arreglos de celdas, como las da `xlsx`) y devuelve registros limpios. Corre igual en el
// navegador (pantalla «Importar») y en el script `scripts/finanzas/importar-conciliacion.ts`. Prueba en
// `leer-excel.test.ts`.
//
// Hojas que entiende (las reconoce por sus títulos, no por su nombre):
//   · Extracto de Banco General: Fecha (01-Sep-2026), Referencia 1…4, Transacción, Descripción, Débito, Crédito.
//   · Extracto de BAC: Fecha, Referencia, Código, Descripción, Débitos, Créditos.
//   · Cualquier otro extracto (CSV del banco): Fecha + Descripción/Concepto + Débito/Crédito o Monto (+ Referencia, Saldo).
//   · YAPPY (cobros del botón de pago), MiPOS (tarjeta) y «Servientrega - Datos» (guías contra entrega).
// Las columnas que Majo agrega a mano («Estado Conciliación», «Orden Detectada», «Monto Detectado»…) se guardan para
// comparar, nunca deciden nada. No se leen nombres, teléfonos, correos ni tarjetas de clientes.

import { huella, leerFecha, leerMonto, type Celda } from "@/lib/finanzas/libro-excel";

export type FormatoHoja = "banco_general" | "bac" | "generico" | "yappy" | "mipos" | "servientrega";

export interface LineaLeida {
  hoja: string;
  /** Fila del Excel (1 = primera), solo para el informe. */
  fila: number;
  /** Posición dentro de la hoja: ordena las líneas de un mismo día. */
  orden: number;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  referencia_extra: string | null;
  codigo: string | null;
  /** Con signo: crédito positivo, débito negativo. */
  monto: number;
  saldo: number | null;
  tienda: string | null;
  estado_excel: string | null;
  /** Huella del contenido (sin la cuenta: el servidor la combina con la cuenta elegida). */
  huella: string;
}

export interface CobroLeido {
  fuente: "yappy" | "mipos" | "servientrega";
  fila: number;
  fecha: string;
  fecha_deposito: string | null;
  referencia: string | null;
  lote: string | null;
  referencia_banco: string | null;
  orden: string | null;
  tienda: string | null;
  repartidor: string | null;
  metodo: string | null;
  monto_bruto: number;
  comision: number;
  anulada: boolean;
  estado_excel: string | null;
  huella: string;
}

export type MetodoOrden = "yappy" | "tarjeta" | "servientrega" | "efectivo" | "transferencia" | "cierre";

export interface OrdenLeida {
  tienda: string | null;
  numero: string;
  fecha: string | null;
  monto: number;
  metodo_pago: MetodoOrden;
  repartidor: string | null;
  huella: string;
}

export interface Descartada {
  hoja: string;
  fila: number;
  motivo: string;
}

export interface HojaLeida {
  hoja: string;
  formato: FormatoHoja;
  lineas: LineaLeida[];
  cobros: CobroLeido[];
  ordenes: OrdenLeida[];
  descartadas: Descartada[];
}

// ---------------------------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------------------------

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  // Las referencias numéricas llegan como 1495163 (número): sin decimales ni notación científica.
  const s = (typeof v === "number" && Number.isInteger(v) ? v.toFixed(0) : String(v)).replace(/\s+/g, " ").trim();
  return s === "" || s === "-" ? null : s;
};

export const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[º°]/g, "O")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const MESES: Record<string, number> = {
  JAN: 1, ENE: 1, FEB: 2, MAR: 3, APR: 4, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, AGO: 8,
  SEP: 9, SET: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12, DIC: 12,
};

/** Fecha de un extracto: lo de `leerFecha` (Date, serie, ISO, dd/mm/aaaa) más «01-Sep-2026», «1/9/26» y «01-09-2026». */
export function fechaBanco(v: Celda): string | null {
  // `xlsx` arma la fecha en la hora local de quien lee: con hora (MiPOS, «22:10») el día UTC podría ser el siguiente.
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const directa = leerFecha(v);
  if (directa) return directa;
  // Yappy escribe a veces el día de la semana adelante: «mar 15/09/2026».
  const s = texto(v)?.replace(/^(lun|mar|mi[eé]|jue|vie|s[aá]b|dom|mon|tue|wed|thu|fri|sat|sun)[a-zá-ú]*\.?,?\s+/i, "");
  if (!s) return null;
  const iso = leerFecha(s);
  if (iso) return iso;
  let dia: number, mes: number, anio: number;
  const conNombre = s.match(/^(\d{1,2})[-/ ]([A-Za-zÁÉÍÓÚáéíóú]{3,4})\.?[-/ ](\d{2,4})$/);
  const numerica = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (conNombre) {
    dia = Number(conNombre[1]);
    mes = MESES[normal(conNombre[2])] ?? 0;
    anio = Number(conNombre[3]);
  } else if (numerica) {
    dia = Number(numerica[1]);
    mes = Number(numerica[2]);
    anio = Number(numerica[3]);
  } else return null;
  if (anio < 100) anio += 2000;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (!mes || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return f.toISOString().slice(0, 10);
}

/**
 * Un monto de extracto: lo de `leerMonto` («$1,769.71», «$0,00») y además «1.234,56» (punto de miles y coma decimal),
 * decidiendo por el separador que aparece último (la misma regla que `parseMonto` de Extractos). null si no es un número.
 */
export function montoBanco(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = texto(v)?.replace(/[$\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s || !/\d/.test(s)) return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  const limpio = coma > punto && s.length - coma - 1 <= 2 ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return leerMonto(v);
  return Math.round(Number(limpio) * 100) / 100;
}

const monto = (v: Celda): number => montoBanco(v) ?? 0;

// ---------------------------------------------------------------------------------------------
// Títulos
// ---------------------------------------------------------------------------------------------

type Indices = Record<string, number>;

/** La fila de títulos (en las primeras 12) que tiene todas las columnas pedidas, con el índice de cada título. */
function titulos(filas: Celda[][], requeridos: string[]): { fila: number; col: Indices } | null {
  for (let i = 0; i < Math.min(filas.length, 12); i++) {
    const col: Indices = {};
    (filas[i] ?? []).forEach((c, j) => {
      const t = texto(c);
      if (t && col[normal(t)] === undefined) col[normal(t)] = j;
    });
    if (requeridos.every((r) => col[r] !== undefined)) return { fila: i, col };
  }
  return null;
}

/** El primer título que exista de los nombrados. */
const una = (col: Indices, ...nombres: string[]): number | undefined => {
  for (const n of nombres) if (col[n] !== undefined) return col[n];
  return undefined;
};

/** Qué es una hoja, por sus títulos. null si no es nada de lo que se concilia. */
export function detectarHoja(filas: Celda[][]): FormatoHoja | null {
  if (titulos(filas, ["GUIA", "CONSIGNACION", "VALOR RECAUDAR"])) return "servientrega";
  if (titulos(filas, ["NO AUTORIZACION", "IMPORTE", "TIPO"])) return "mipos";
  if (titulos(filas, ["PUNTO DE COBRO", "TOTAL", "REFERENCIA"])) return "yappy";
  if (titulos(filas, ["FECHA", "TRANSACCION", "DEBITO", "CREDITO"])) return "banco_general";
  if (titulos(filas, ["FECHA", "CODIGO", "DEBITOS", "CREDITOS"])) return "bac";
  if (ubicarGenerico(filas)) return "generico";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Extractos
// ---------------------------------------------------------------------------------------------

interface ColumnasExtracto {
  fila: number;
  fecha: number;
  descripcion?: number;
  referencias: number[];
  codigo?: number;
  debito?: number;
  credito?: number;
  monto?: number;
  saldo?: number;
  estado?: number;
  tienda?: number;
}

function ubicarGenerico(filas: Celda[][]): ColumnasExtracto | null {
  for (let i = 0; i < Math.min(filas.length, 12); i++) {
    const nombres = (filas[i] ?? []).map((c) => normal(texto(c) ?? ""));
    const idx = (...op: string[]) => {
      const j = nombres.findIndex((n) => op.some((o) => n === o || n.startsWith(`${o} `)));
      return j >= 0 ? j : undefined;
    };
    // La fecha, con su nombre exacto: «Fecha depósito (código)» de un reporte no es la fecha de un extracto.
    const exacta = nombres.findIndex((n) => ["FECHA", "DATE", "FECHA VALOR", "FECHA DE TRANSACCION", "FECHA TRANSACCION", "FECHA OPERACION"].includes(n));
    const fecha = exacta >= 0 ? exacta : undefined;
    const debito = idx("DEBITO", "DEBITOS", "RETIRO", "RETIROS", "CARGO", "CARGOS");
    const credito = idx("CREDITO", "CREDITOS", "DEPOSITO", "DEPOSITOS", "ABONO", "ABONOS");
    const montoCol = idx("MONTO", "IMPORTE", "VALOR", "AMOUNT");
    if (fecha === undefined || ((debito === undefined || credito === undefined) && montoCol === undefined)) continue;
    return {
      fila: i,
      fecha,
      descripcion: idx("DESCRIPCION", "CONCEPTO", "DETALLE", "DESCRIPTION"),
      referencias: [idx("REFERENCIA", "REF", "DOCUMENTO", "NO DOCUMENTO")].filter((x): x is number => x !== undefined),
      codigo: idx("CODIGO", "TRANSACCION"),
      debito,
      credito,
      monto: debito === undefined || credito === undefined ? montoCol : undefined,
      saldo: idx("SALDO", "BALANCE"),
    };
  }
  return null;
}

function columnasExtracto(filas: Celda[][], formato: "banco_general" | "bac" | "generico"): ColumnasExtracto | null {
  if (formato === "generico") return ubicarGenerico(filas);
  const t = titulos(filas, formato === "banco_general" ? ["FECHA", "TRANSACCION", "DEBITO", "CREDITO"] : ["FECHA", "CODIGO", "DEBITOS", "CREDITOS"]);
  if (!t) return null;
  const { col } = t;
  return {
    fila: t.fila,
    fecha: col.FECHA,
    descripcion: una(col, "DESCRIPCION"),
    referencias: ["REFERENCIA", "REFERENCIA 1", "REFERENCIA 2", "REFERENCIA 3", "REFERENCIA 4"]
      .map((n) => col[n])
      .filter((x): x is number => x !== undefined),
    codigo: una(col, "TRANSACCION", "CODIGO"),
    debito: una(col, "DEBITO", "DEBITOS"),
    credito: una(col, "CREDITO", "CREDITOS"),
    saldo: una(col, "SALDO"),
    estado: una(col, "ESTADO CONCILIACION"),
    tienda: una(col, "TIENDA DETECTADA"),
  };
}

const ESTADOS_EXCEL: Record<string, string> = {
  CONCILIADO: "conciliado",
  "NO CONCILIADO": "no_conciliado",
  "PENDIENTE DE REVISION": "en_revision",
};

/** Lo que Majo marcó, en una de tres palabras (o el texto tal cual si es otro). */
export function estadoExcel(v: Celda): string | null {
  const t = texto(v);
  if (!t) return null;
  return ESTADOS_EXCEL[normal(t)] ?? t.slice(0, 40);
}

/**
 * La referencia principal de una línea de Banco General es «Referencia 1» (la de «Referencia» es un número de sucursal
 * o canal que se repite); en BAC y en un CSV, la primera que haya.
 */
function referenciasDe(fila: Celda[], c: ColumnasExtracto, formato: string): { principal: string | null; extra: string | null } {
  const valores = c.referencias.map((j) => texto(fila[j]));
  if (formato === "banco_general" && valores.length > 1) {
    const [canal, principal, ...resto] = valores;
    const extra = [...resto, canal].filter(Boolean).join(" · ");
    return { principal: principal ?? null, extra: extra || null };
  }
  const [principal, ...resto] = valores;
  return { principal: principal ?? null, extra: resto.filter(Boolean).join(" · ") || null };
}

function leerExtracto(hoja: string, filas: Celda[][], formato: "banco_general" | "bac" | "generico"): HojaLeida {
  const salida: HojaLeida = { hoja, formato, lineas: [], cobros: [], ordenes: [], descartadas: [] };
  const c = columnasExtracto(filas, formato);
  if (!c) return salida;
  const vistas = new Map<string, number>();
  for (let i = c.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (f.every((x) => texto(x) === null)) continue;
    const numeroFila = i + 1;
    const fecha = fechaBanco(f[c.fecha]);
    const valor =
      c.monto !== undefined
        ? monto(f[c.monto])
        : Math.round((monto(f[c.credito!]) - Math.abs(monto(f[c.debito!]))) * 100) / 100;
    if (!fecha) {
      salida.descartadas.push({ hoja, fila: numeroFila, motivo: "sin fecha" });
      continue;
    }
    if (!valor) {
      salida.descartadas.push({ hoja, fila: numeroFila, motivo: "sin monto" });
      continue;
    }
    const { principal, extra } = referenciasDe(f, c, formato);
    const descripcion = (c.descripcion !== undefined ? texto(f[c.descripcion]) : null) ?? "";
    const codigo = c.codigo !== undefined ? texto(f[c.codigo]) : null;
    const contenido = [fecha, principal, extra, codigo, descripcion, valor.toFixed(2)].join("|");
    const ordinal = (vistas.get(contenido) ?? 0) + 1;
    vistas.set(contenido, ordinal);
    const tienda = c.tienda !== undefined ? texto(f[c.tienda]) : null;
    salida.lineas.push({
      hoja,
      fila: numeroFila,
      orden: salida.lineas.length + 1,
      fecha,
      descripcion: descripcion.slice(0, 300),
      referencia: principal?.slice(0, 80) ?? null,
      referencia_extra: extra?.slice(0, 120) ?? null,
      codigo: codigo?.slice(0, 20) ?? null,
      monto: valor,
      saldo: c.saldo !== undefined ? montoBanco(f[c.saldo]) : null,
      tienda: tienda ? tienda.slice(0, 60) : null,
      estado_excel: c.estado !== undefined ? estadoExcel(f[c.estado]) : null,
      huella: `${huella(contenido)}#${ordinal}`,
    });
  }
  // Lo que Majo detectó y marcó Conciliado: las órdenes y cierres que ella cruzó (puente hasta ven_ordenes).
  salida.ordenes = ordenesDetectadas(hoja, filas, c.fila, formato);
  return salida;
}

/** El repartidor dentro de «Monday Cierre (JULY CALLE)» o «Monday (DELIVERY REPORTES DIARIOS) ANIBAL». */
function repartidorDe(origen: string | null): string | null {
  if (!origen) return null;
  const entre = origen.match(/\(([^)]+)\)\s*$/)?.[1] ?? origen.match(/\(([^)]+)\)/)?.[1];
  const despues = origen.match(/\)\s+([^()]+)$/)?.[1];
  const nombre = despues ?? entre;
  if (!nombre || /REPORTES|INFORME|SERVIENTREGA|YAPPY/i.test(nombre)) return null;
  return nombre.trim().slice(0, 60);
}

function ordenesDetectadas(hoja: string, filas: Celda[][], filaTitulos: number, formato: string): OrdenLeida[] {
  if (formato === "generico") return [];
  const col: Indices = {};
  (filas[filaTitulos] ?? []).forEach((x, j) => {
    const t = texto(x);
    if (t && col[normal(t)] === undefined) col[normal(t)] = j;
  });
  const cOrden = col["ORDEN DETECTADA"];
  const cMonto = col["MONTO DETECTADO"];
  const cEstado = col["ESTADO CONCILIACION"];
  if (cOrden === undefined || cMonto === undefined) return [];
  const salida: OrdenLeida[] = [];
  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (estadoExcel(f[cEstado]) !== "conciliado") continue;
    const numero = texto(f[cOrden]);
    const valor = montoBanco(f[cMonto]);
    // Los cortes de Yappy y las consignaciones de Servientrega son cobros, no órdenes.
    if (!numero || !valor || /^(CORTE|SERVIENTREGA)/i.test(numero)) continue;
    const cierre = /^CIERRE\b/i.test(numero);
    const fechaCierre = numero.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1];
    salida.push({
      tienda: texto(f[col["TIENDA DETECTADA"]])?.slice(0, 60) ?? null,
      numero: numero.slice(0, 60),
      fecha: (fechaCierre ? leerFecha(fechaCierre) : null) ?? fechaBanco(f[col.FECHA]),
      monto: Math.round(valor * 100) / 100,
      metodo_pago: cierre ? "cierre" : "transferencia",
      repartidor: repartidorDe(texto(f[col.ORIGEN])),
      huella: `${huella(`orden|${hoja}|${i + 1}|${numero}|${valor.toFixed(2)}`)}#1`,
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Fuentes de cobro
// ---------------------------------------------------------------------------------------------

const ordenDe = (v: Celda): string | null => {
  const t = texto(v);
  if (!t || /^(N\/?A|NA|PRUEBA)$/i.test(t)) return null;
  return t.replace(/^#/, "").slice(0, 40);
};

function leerYappy(hoja: string, filas: Celda[][]): HojaLeida {
  const salida: HojaLeida = { hoja, formato: "yappy", lineas: [], cobros: [], ordenes: [], descartadas: [] };
  const t = titulos(filas, ["PUNTO DE COBRO", "TOTAL", "REFERENCIA"]);
  if (!t) return salida;
  const { col } = t;
  for (let i = t.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (f.every((x) => texto(x) === null)) continue;
    const fecha = fechaBanco(f[col.FECHA]);
    const total = montoBanco(f[col.TOTAL]);
    const referencia = texto(f[col.REFERENCIA]);
    if (!fecha || !total || !referencia) {
      salida.descartadas.push({ hoja, fila: i + 1, motivo: !fecha ? "sin fecha" : !total ? "sin monto" : "sin referencia" });
      continue;
    }
    const estado = normal(texto(f[col.ESTADO]) ?? "PROCESADA");
    const orden = ordenDe(f[col.ORDENDETECTADO]);
    const tienda = texto(f[col.TIENDAMONDAY])?.slice(0, 60) ?? null;
    const repartidor = texto(f[col.DELIVERYDETECTADO])?.replace(/\s+/g, " ").slice(0, 60) ?? null;
    salida.cobros.push({
      fuente: "yappy",
      fila: i + 1,
      fecha,
      fecha_deposito: null,
      referencia: referencia.slice(0, 60),
      lote: null,
      referencia_banco: null,
      orden,
      tienda,
      repartidor,
      metodo: "yappy",
      monto_bruto: Math.round(total * 100) / 100,
      comision: 0,
      anulada: estado !== "PROCESADA",
      estado_excel: estadoExcel(f[col.ESTADOCONCILIACION]),
      huella: `${huella(`yappy|${referencia}`)}#1`,
    });
    const montoOrden = montoBanco(f[col.MONTOMONDAY]);
    if (orden && montoOrden) {
      salida.ordenes.push({
        tienda,
        numero: orden,
        fecha,
        monto: Math.round(montoOrden * 100) / 100,
        metodo_pago: "yappy",
        repartidor,
        huella: `${huella(`orden|yappy|${referencia}|${orden}`)}#1`,
      });
    }
  }
  return salida;
}

function leerMipos(hoja: string, filas: Celda[][]): HojaLeida {
  const salida: HojaLeida = { hoja, formato: "mipos", lineas: [], cobros: [], ordenes: [], descartadas: [] };
  const t = titulos(filas, ["NO AUTORIZACION", "IMPORTE", "TIPO"]);
  if (!t) return salida;
  const { col } = t;
  for (let i = t.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (f.every((x) => texto(x) === null)) continue;
    const fecha = fechaBanco(f[col.FECHA]);
    const importe = montoBanco(f[col.IMPORTE]);
    const autorizacion = texto(f[col["NO AUTORIZACION"]]);
    if (!fecha || !importe || !autorizacion) {
      salida.descartadas.push({ hoja, fila: i + 1, motivo: !fecha ? "sin fecha" : !importe ? "sin monto" : "sin autorización" });
      continue;
    }
    const anulacion = normal(texto(f[col.TIPO]) ?? "") === "ANULACION";
    const estadoConc = estadoExcel(f[col.ESTADOCONCILIACION]);
    const afiliado = texto(f[col["NO DE AFILIADO"]]);
    const lote = texto(f[col["NO DE LOTE"]]);
    const orden = ordenDe(f[col.ORDENDETECTADO]);
    const tienda = texto(f[col.TIENDAMONDAY])?.slice(0, 60) ?? null;
    const repartidor = texto(f[col.DELIVERYDETECTADO])?.slice(0, 60) ?? null;
    salida.cobros.push({
      fuente: "mipos",
      fila: i + 1,
      fecha,
      fecha_deposito: null,
      referencia: autorizacion.slice(0, 40),
      lote: afiliado && lote ? `${afiliado}/${lote}` : null,
      referencia_banco: null,
      orden,
      tienda: tienda && normal(tienda) !== "PRUEBA" ? tienda : null,
      repartidor,
      metodo: texto(f[col["METODO DE PAGO"]])?.slice(0, 40) ?? "tarjeta",
      monto_bruto: Math.round(importe * 100) / 100,
      comision: 0,
      anulada: anulacion || /^anulado/i.test(estadoConc ?? ""),
      estado_excel: estadoConc,
      huella: `${huella(`mipos|${autorizacion}|${texto(f[col.FECHA]) ?? fecha}`)}#1`,
    });
    const montoOrden = montoBanco(f[col.MONTOMONDAY]);
    if (orden && montoOrden && !anulacion) {
      salida.ordenes.push({
        tienda,
        numero: orden,
        fecha,
        monto: Math.round(montoOrden * 100) / 100,
        metodo_pago: "tarjeta",
        repartidor,
        huella: `${huella(`orden|mipos|${autorizacion}|${orden}`)}#1`,
      });
    }
  }
  return salida;
}

/**
 * El código de consignación de Servientrega trae la referencia del depósito y su fecha: «BAC6458CPLPEN_01092026» es el
 * depósito de BAC con referencia terminada en 6458 del 01/09/2026; «ACHBAC11436619NUVO_28082026», la transferencia
 * 11436619. «MPOSNUVOFT…» (cobrado con tarjeta) no trae referencia.
 */
export function leerConsignacion(codigo: string): { referencia: string | null; fecha: string | null } {
  const c = codigo.trim().toUpperCase();
  const referencia = c.match(/^(?:ACH)?BAC(\d{3,})/)?.[1] ?? null;
  const f = c.match(/_(\d{2})(\d{2})(\d{4})$/);
  const fecha = f ? leerFecha(`${f[1]}/${f[2]}/${f[3]}`) : null;
  return { referencia, fecha };
}

function leerServientrega(hoja: string, filas: Celda[][]): HojaLeida {
  const salida: HojaLeida = { hoja, formato: "servientrega", lineas: [], cobros: [], ordenes: [], descartadas: [] };
  const t = titulos(filas, ["GUIA", "CONSIGNACION", "VALOR RECAUDAR"]);
  if (!t) return salida;
  const { col } = t;
  for (let i = t.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (f.every((x) => texto(x) === null)) continue;
    const guia = texto(f[col.GUIA]);
    const valor = montoBanco(f[col["VALOR RECAUDAR"]]);
    const consignacion = texto(f[col.CONSIGNACION]);
    const fecha = fechaBanco(f[col["FECHA DE ENTREGA"]]) ?? fechaBanco(f[col["FECHA EMISION"]]);
    if (!guia || !valor || !fecha) {
      // Un título repetido (otro informe pegado debajo) o una fila de totales.
      if (normal(guia ?? "") !== "GUIA") salida.descartadas.push({ hoja, fila: i + 1, motivo: !guia ? "sin guía" : !valor ? "sin monto" : "sin fecha" });
      continue;
    }
    const { referencia, fecha: fechaDeposito } = consignacion ? leerConsignacion(consignacion) : { referencia: null, fecha: null };
    const tienda = texto(f[una(col, "NOMBRE CLIENTE") ?? -1])?.slice(0, 60) ?? null;
    const orden = ordenDe(f[una(col, "NUMERO FACTURA") ?? -1]);
    salida.cobros.push({
      fuente: "servientrega",
      fila: i + 1,
      fecha,
      fecha_deposito: fechaDeposito,
      referencia: guia.slice(0, 40),
      lote: consignacion?.slice(0, 80) ?? null,
      referencia_banco: referencia,
      orden,
      tienda,
      repartidor: null,
      metodo: texto(f[una(col, "METODO DE PAGO") ?? -1])?.toLowerCase().slice(0, 40) ?? null,
      monto_bruto: Math.round(valor * 100) / 100,
      comision: 0,
      anulada: false,
      estado_excel: null,
      huella: `${huella(`servientrega|${guia}`)}#1`,
    });
    if (orden) {
      salida.ordenes.push({
        tienda,
        numero: orden,
        fecha,
        monto: Math.round(valor * 100) / 100,
        metodo_pago: "servientrega",
        repartidor: null,
        huella: `${huella(`orden|servientrega|${guia}|${orden}`)}#1`,
      });
    }
  }
  return salida;
}

/** Lee una hoja según lo que es. Devuelve null si no es nada de lo que se concilia. */
export function leerHoja(hoja: string, filas: Celda[][]): HojaLeida | null {
  const formato = detectarHoja(filas);
  if (!formato) return null;
  if (formato === "yappy") return leerYappy(hoja, filas);
  if (formato === "mipos") return leerMipos(hoja, filas);
  if (formato === "servientrega") return leerServientrega(hoja, filas);
  return leerExtracto(hoja, filas, formato);
}

/**
 * La cuenta del libro (`fin_cuentas`) que corresponde a una hoja de extracto, por su nombre: «BANCO GENERAL» → Banco
 * General; «BAC» → BAC Oceans (la cuenta de Nuvo); «ECOMFIVE» → BAC Ecomfive. null si no se reconoce (se elige a mano).
 */
export function cuentaSugerida(hoja: string, cuentas: { id: string; nombre: string }[]): string | null {
  const h = normal(hoja);
  const por = (pred: (n: string) => boolean) => cuentas.find((c) => pred(normal(c.nombre)))?.id ?? null;
  if (h.includes("GENERAL")) return por((n) => n === "BANCO GENERAL");
  if (h.includes("ECOMFIVE")) return por((n) => n.includes("BAC") && n.includes("ECOMFIVE") && !n.includes("TDC"));
  if (h.includes("BAC")) return por((n) => n.includes("BAC") && n.includes("OCEANS") && !n.includes("TDC"));
  return por((n) => n === h);
}
