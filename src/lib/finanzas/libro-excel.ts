// Lectura del libro de movimientos de Excel (GASTOS_PANAMA_<año>.xlsx, hoja «<año>») y de la base de reparto (hoja
// «EERR», filas «TOTAL ENVÍOS» y «ENTREGADOS»). Lógica pura: recibe las filas ya leídas del Excel (arreglos de celdas)
// y devuelve registros limpios; el script `scripts/finanzas/importar-libro.ts` hace la lectura y la escritura.
// Prueba en `libro-excel.test.ts`.


export type Celda = string | number | boolean | Date | null | undefined;

export interface MovimientoExcel {
  /** Fila del Excel (1 = primera), solo para el informe. */
  fila: number;
  periodo: string;
  fecha_registro: string | null;
  unidad: string;
  tipo: string | null;
  estatus_gestion: string | null;
  unidad_a_pagar: string | null;
  descripcion: string;
  en_eerr: boolean;
  en_flujo: boolean;
  /** En la moneda del movimiento (`moneda`): en dólares para el libro de Panamá. */
  monto: number;
  /** USD, CRC… (migración 0923). */
  moneda: string;
  fecha_servicio: string | null;
  fecha_pago: string | null;
  cuenta: string | null;
  factura: string | null;
  factura_numero: string | null;
  ruc_proveedor: string | null;
  es_bien_de_uso: boolean;
  origen_clave: string;
}

/**
 * Huella de 96 bits de un texto (tres pasadas de cyrb53 con semillas distintas). No es criptográfica: solo identifica
 * una fila para que reimportar no duplique. Pura y sin dependencias, así corre igual en el navegador y en el servidor.
 */
export function huella(texto: string): string {
  const cyrb53 = (semilla: number) => {
    let h1 = 0xdeadbeef ^ semilla;
    let h2 = 0x41c6ce57 ^ semilla;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0").slice(-8);
  };
  return cyrb53(1) + cyrb53(2) + cyrb53(3);
}

/** La unidad de los movimientos que llegan sin tienda: quedan a la vista para clasificarlos. */
export const UNIDAD_SIN_ASIGNAR = "SIN ASIGNAR";

export interface Descartada {
  fila: number;
  motivo: string;
}

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString() : String(v)).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** «9.5», 9.5, «1,250.40», «$ 12» → número; vacío o no numérico → null. */
export function leerMonto(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = texto(v);
  if (!s) return null;
  const limpio = s.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fecha de Excel (Date, número de serie o texto AAAA-MM-DD) → AAAA-MM-DD, o null. También el texto DD/MM/AAAA, que es
 * como se ve (y se copia) una fecha en el libro de Panamá.
 */
export function leerFecha(v: Celda): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Serie de Excel (días desde 1899-12-30).
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = texto(v);
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!d) return null;
  const [dia, mes, anio] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return f.toISOString().slice(0, 10);
}

/** «1-2026» → «2026-01-01»; null si no tiene esa forma. */
export function leerPeriodo(v: Celda): string | null {
  const s = texto(v);
  const m = s?.match(/^(\d{1,2})\s*[-/]\s*(\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;
  return `${m[2]}-${String(mes).padStart(2, "0")}-01`;
}

const siNo = (v: Celda) => normal(texto(v) ?? "") === "SI";

/** Encabezados que se buscan en la fila de títulos (sin acentos ni mayúsculas). Se aceptan variantes. */
const ENCABEZADOS = {
  mes: ["MES"],
  fecha_registro: ["FECHA INCLUSION"],
  unidad: ["TIENDA"],
  tipo: ["TIPO"],
  estatus_gestion: ["ESTATUS DE GESTION"],
  unidad_a_pagar: ["TIENDA A PAGAR"],
  descripcion: ["DESCRIPCION"],
  en_eerr: ["EERR?"],
  en_flujo: ["FLUJO ?", "FLUJO?"],
  monto: ["USD"],
  moneda: ["MONEDA"],
  fecha_servicio: ["PRESTACION DE SERVICIO"],
  fecha_pago: ["PAGO"],
  cuenta: ["FORMA DE PAGO"],
  factura: ["FACTURA NOMBRE/ENLACE"],
  factura_numero: ["N° DE FACTURA", "NO DE FACTURA"],
  ruc_proveedor: ["RUC PROVEEDOR"],
  es_bien_de_uso: ["¿ES BIEN DE USO?", "ES BIEN DE USO?"],
} as const;
type Campo = keyof typeof ENCABEZADOS;

/**
 * Títulos que puede tener la columna del monto, en orden de preferencia: «USD» (el libro de Panamá), el código de otra
 * moneda (el libro de Costa Rica puede traer «CRC») o «MONTO» / «IMPORTE».
 */
const TITULOS_MONTO = ["USD", "CRC", "MONTO", "IMPORTE"];

/** Busca la fila de títulos (la que tiene MES, TIENDA, TIPO y el monto) y la columna de cada campo. */
export function ubicarColumnas(filas: Celda[][]): { fila: number; columnas: Partial<Record<Campo, number>>; tituloMonto: string } | null {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const nombres = filas[i].map((c) => normal(texto(c) ?? ""));
    const tituloMonto = TITULOS_MONTO.find((t) => nombres.includes(t));
    if (!tituloMonto || !["MES", "TIENDA", "TIPO"].every((n) => nombres.includes(n))) continue;
    const columnas: Partial<Record<Campo, number>> = {};
    for (const [campo, opciones] of Object.entries(ENCABEZADOS) as [Campo, readonly string[]][]) {
      const idx = nombres.findIndex((n) => opciones.some((o) => n === normal(o) || n.startsWith(normal(o))));
      if (idx >= 0) columnas[campo] = idx;
    }
    // «PAGO» también calza con «Prestación…» si se busca por prefijo: se toma el exacto.
    const pagoExacto = nombres.indexOf("PAGO");
    if (pagoExacto >= 0) columnas.fecha_pago = pagoExacto;
    columnas.monto = nombres.indexOf(tituloMonto);
    return { fila: i, columnas, tituloMonto };
  }
  return null;
}

/** Código de moneda (tres letras) de una celda, o null. */
export function leerMoneda(v: Celda): string | null {
  const s = normal(texto(v) ?? "");
  if (s === "$" || s === "US$" || s === "DOLARES") return "USD";
  if (s === "₡" || s === "COLONES") return "CRC";
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/**
 * Convierte las filas de la hoja del libro en movimientos. Se descarta una fila sin mes, sin tienda o sin monto
 * (queda en `descartadas` con su motivo). La huella `origen_clave` sale del contenido de la fila más un ordinal para
 * las filas idénticas, así que reimportar el mismo archivo no duplica.
 *
 * Moneda de cada fila: la de su columna MONEDA si la trae; si no, la del título del monto cuando es otra moneda
 * («CRC»); si no, `opciones.moneda` (la del libro que se eligió al importar); si no, dólares.
 */
export function leerLibro(
  filas: Celda[][],
  origen: string,
  opciones: { moneda?: string } = {},
): { movimientos: MovimientoExcel[]; descartadas: Descartada[] } {
  const ubicacion = ubicarColumnas(filas);
  if (!ubicacion) throw new Error("No encontré la fila de títulos (MES, TIENDA, TIPO, USD) en la hoja del libro.");
  const { fila: filaTitulos, columnas: c, tituloMonto } = ubicacion;
  const monedaDelLibro = (tituloMonto !== "USD" ? leerMoneda(tituloMonto) : null) ?? leerMoneda(opciones.moneda) ?? "USD";
  const celda = (fila: Celda[], campo: Campo): Celda => (c[campo] === undefined ? null : fila[c[campo]!]);

  const movimientos: MovimientoExcel[] = [];
  const descartadas: Descartada[] = [];
  const vistas = new Map<string, number>();

  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const f = filas[i];
    const numeroFila = i + 1;
    const unidad = texto(celda(f, "unidad"));
    const periodo = leerPeriodo(celda(f, "mes"));
    const monto = leerMonto(celda(f, "monto"));
    if (!unidad && !periodo && monto === null) continue; // fila vacía
    if (!periodo) {
      descartadas.push({ fila: numeroFila, motivo: "sin mes" });
      continue;
    }
    if (monto === null || monto === 0) {
      descartadas.push({ fila: numeroFila, motivo: "sin monto" });
      continue;
    }
    const base = {
      periodo,
      fecha_registro: leerFecha(celda(f, "fecha_registro")),
      // Sin tienda: es un movimiento que todavía no se clasificó; entra como «SIN ASIGNAR» para que se vea pendiente.
      unidad: unidad ?? UNIDAD_SIN_ASIGNAR,
      tipo: texto(celda(f, "tipo")),
      estatus_gestion: texto(celda(f, "estatus_gestion")),
      unidad_a_pagar: texto(celda(f, "unidad_a_pagar")),
      descripcion: texto(celda(f, "descripcion")) ?? "",
      en_eerr: siNo(celda(f, "en_eerr")),
      en_flujo: siNo(celda(f, "en_flujo")),
      // Con su signo: un monto negativo en el libro es un reverso (devuelve lo de su tipo) y debe restar.
      monto: Math.round(monto * 100) / 100,
      moneda: leerMoneda(celda(f, "moneda")) ?? monedaDelLibro,
      fecha_servicio: leerFecha(celda(f, "fecha_servicio")),
      fecha_pago: leerFecha(celda(f, "fecha_pago")),
      cuenta: texto(celda(f, "cuenta")),
      factura: texto(celda(f, "factura")),
      factura_numero: texto(celda(f, "factura_numero")),
      ruc_proveedor: texto(celda(f, "ruc_proveedor")),
      es_bien_de_uso: siNo(celda(f, "es_bien_de_uso")),
    };
    const contenido = [
      origen,
      base.periodo,
      base.fecha_registro,
      base.unidad,
      base.tipo,
      base.descripcion,
      base.monto.toFixed(2),
      base.fecha_servicio,
      base.fecha_pago,
      base.cuenta,
      // Solo si no es dólares: la huella de los movimientos en dólares (todo el libro de Panamá) no cambia.
      ...(base.moneda === "USD" ? [] : [base.moneda]),
    ].join("|");
    const ordinal = (vistas.get(contenido) ?? 0) + 1;
    vistas.set(contenido, ordinal);
    const origen_clave = `${huella(contenido)}#${ordinal}`;
    movimientos.push({ fila: numeroFila, ...base, origen_clave });
  }
  return { movimientos, descartadas };
}

export interface BaseExcel {
  periodo: string;
  unidad: string;
  envios: number;
  entregados: number;
}

/**
 * La base de reparto desde la hoja EERR: cada mes es un bloque con «PERÍODO» + fecha en la fila de períodos y los
 * nombres de las tiendas en la fila de abajo; «TOTAL ENVÍOS» y «ENTREGADOS» dan los números de cada tienda.
 */
export function leerBaseDistribucion(filas: Celda[][]): BaseExcel[] {
  const filaPeriodos = filas.findIndex((f) => f.some((c) => normal(texto(c) ?? "") === "PERIODO"));
  if (filaPeriodos < 0) return [];
  const periodos = filas[filaPeriodos];
  const filaTiendas = filas.slice(filaPeriodos + 1, filaPeriodos + 4).find((f) => f.some((c) => normal(texto(c) ?? "") === "TOTAL"));
  if (!filaTiendas) return [];
  const bloques: { periodo: string; col: number }[] = [];
  periodos.forEach((c, i) => {
    if (normal(texto(c) ?? "") === "PERIODO") {
      const fecha = leerFecha(periodos[i + 1]);
      if (fecha) bloques.push({ periodo: `${fecha.slice(0, 7)}-01`, col: i });
    }
  });
  const buscarFila = (prefijo: string) =>
    filas.find((f) => f.slice(0, 4).some((c) => normal(texto(c) ?? "").startsWith(prefijo)));
  const envios = buscarFila("TOTAL ENV");
  const entregados = buscarFila("ENTREGADOS");
  if (!envios) return [];

  const salida: BaseExcel[] = [];
  bloques.forEach((b, i) => {
    const desde = i === 0 ? 0 : bloques[i - 1].col + 2;
    for (let k = desde; k <= b.col + 1; k++) {
      const unidad = texto(filaTiendas[k]);
      if (!unidad || normal(unidad) === "TOTAL") continue;
      const e = leerMonto(envios[k]);
      if (e === null) continue;
      salida.push({
        periodo: b.periodo,
        unidad,
        envios: Math.max(0, Math.round(e)),
        entregados: Math.max(0, Math.round(leerMonto(entregados?.[k]) ?? 0)),
      });
    }
  });
  return salida;
}

/** Clase de una cuenta (forma de pago) según su nombre. */
export function claseDeCuenta(nombre: string): "banco" | "tarjeta" | "billetera" | "otro" {
  const n = normal(nombre);
  if (/\b(TDC|VISA|AMERICAN|AMEX|MASTERCARD)\b/.test(n)) return "tarjeta";
  if (/\b(BINANCE|YAPPY|PAYPAL)\b/.test(n)) return "billetera";
  if (n === "MANUAL") return "otro";
  return "banco";
}

/** Nombre canónico para comparar catálogos («Comisiones Bancarias» = «Comisiones bancarias»). */
export const claveCatalogo = normal;
