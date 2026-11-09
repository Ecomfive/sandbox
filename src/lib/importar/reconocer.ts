// «Importar» universal: qué es cada Excel o CSV por sus hojas y sus títulos, y a qué módulos alimenta. Lógica pura
// (recibe el nombre de cada hoja y sus primeras filas) para poder probarla sin archivos; la pantalla `/importar` la
// llama en el navegador. Las huellas reutilizan los mismos detectores de cada importador (`ubicarColumnas` del libro,
// `hojasDeCartera`, `detectarTipo` de la nómina, `ubicarColumnasMatriz` de ventas, `ubicarEstructura` de deliverys y
// `detectarHoja` de conciliación): si un importador aprende un formato nuevo, aquí se reconoce solo.
// Prueba en `reconocer.test.ts` (con hojas inventadas que imitan los títulos reales).

import { detectarHoja } from "@/lib/conciliacion/leer-excel";
import { ubicarEstructura } from "@/lib/deliverys/excel";
import { hojasDeCartera } from "@/lib/finanzas/cxc-cxp-excel";
import { ubicarColumnas, type Celda } from "@/lib/finanzas/libro-excel";
import { detectarTipo } from "@/lib/nomina/excel";
import { ubicarColumnasMatriz } from "@/lib/ventas/matriz";

/** Los módulos que tienen importador. La clave es la del módulo de permisos. */
export type ModuloImportable =
  | "libro-movimientos"
  | "bienes-de-uso"
  | "cuentas-por-cobrar"
  | "cuentas-por-pagar"
  | "costos-mercancia"
  | "nomina"
  | "ventas-tiendas"
  | "deliverys"
  | "conciliacion-bancaria";

/**
 * Orden de carga: el libro primero (bienes, carteras y la nómina que pasa al libro se apoyan en sus tiendas y tipos),
 * los costos antes que las ventas (la rentabilidad cruza las dos), las ventas antes que deliverys y conciliación (la
 * conciliación busca las órdenes de venta y las parejas con delivery) y la conciliación al final.
 */
export const ORDEN_CARGA: ModuloImportable[] = [
  "libro-movimientos",
  "bienes-de-uso",
  "cuentas-por-cobrar",
  "cuentas-por-pagar",
  "costos-mercancia",
  "nomina",
  "ventas-tiendas",
  "deliverys",
  "conciliacion-bancaria",
];

export const NOMBRE_MODULO: Record<ModuloImportable, string> = {
  "libro-movimientos": "Libro de movimientos",
  "bienes-de-uso": "Bienes de uso",
  "cuentas-por-cobrar": "Cuentas por cobrar",
  "cuentas-por-pagar": "Cuentas por pagar",
  "costos-mercancia": "Costos de mercancía",
  nomina: "Nómina",
  "ventas-tiendas": "Ventas por tienda",
  deliverys: "Deliverys",
  "conciliacion-bancaria": "Conciliación bancaria",
};

/** El importador propio de cada módulo (para revisar en detalle o elegir lo que el universal decide solo). */
export const RUTA_IMPORTADOR: Record<ModuloImportable, string> = {
  "libro-movimientos": "/libro-movimientos/importar",
  "bienes-de-uso": "/bienes-de-uso/importar",
  "cuentas-por-cobrar": "/cuentas-por-cobrar/importar",
  "cuentas-por-pagar": "/cuentas-por-pagar/importar",
  "costos-mercancia": "/costos-mercancia/importar",
  nomina: "/nomina/importar",
  "ventas-tiendas": "/ventas-tiendas/importar",
  deliverys: "/deliverys/importar",
  "conciliacion-bancaria": "/conciliacion-bancaria/importar",
};

/** Filas de cada hoja que bastan para reconocerla: los títulos de todos los formatos están antes de la fila 40. */
export const FILAS_MUESTRA = 40;

export interface HojaMuestra {
  nombre: string;
  /** Las primeras filas de la hoja (hasta `FILAS_MUESTRA`). */
  filas: Celda[][];
}

export interface Reconocido {
  modulo: ModuloImportable;
  /** Las hojas del archivo que usa ese módulo. */
  hojas: string[];
  /** Qué se reconoció, en pocas palabras («Planilla formal», «Extracto BAC, Cobros Yappy»). */
  detalle: string;
}

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** ¿Alguna de las primeras filas trae este título (exacto, sin acentos ni espacios de sobra)? */
const tieneTitulo = (filas: Celda[][], titulo: string) => filas.some((f) => (f ?? []).some((c) => normal(c) === titulo));

const ETIQUETA_FORMATO: Record<string, string> = {
  banco_general: "Extracto Banco General",
  bac: "Extracto BAC",
  generico: "Extracto bancario",
  yappy: "Cobros Yappy",
  mipos: "Cobros MiPOS",
  servientrega: "Guías Servientrega",
};

/** La nómina lee celdas sin fechas de JavaScript (ver `src/lib/nomina/hoja.ts`): para los títulos basta el texto. */
const celdaNomina = (c: Celda): string | number | boolean | null => (c instanceof Date ? c.toISOString().slice(0, 10) : (c ?? null));

const unicos = (xs: string[]) => [...new Set(xs)];

/**
 * Qué módulos alimenta un archivo. Un mismo archivo puede alimentar varios (el libro de gastos trae el libro, la base
 * de reparto, las carteras y los bienes de uso). Las hojas que ya usa otro módulo no cuentan para la conciliación (la
 * hoja «Informe SE» del archivo de ventas tiene los títulos de Servientrega, pero la lee Ventas). Devuelve los módulos
 * en el orden de carga.
 */
export function reconocerArchivo(hojas: HojaMuestra[]): Reconocido[] {
  const salida: Reconocido[] = [];
  const nombres = hojas.map((h) => h.nombre);
  const usadas = new Set<string>();
  const usar = (modulo: ModuloImportable, hs: string[], detalle: string) => {
    hs.forEach((h) => usadas.add(h));
    salida.push({ modulo, hojas: hs, detalle });
  };

  // Libro de movimientos: la hoja con MES, TIENDA, TIPO y USD; primero la que se llama como un año.
  const libro = hojas
    .filter((h) => ubicarColumnas(h.filas) !== null)
    .map((h) => h.nombre)
    .sort((a, b) => Number(/^20\d{2}$/.test(b.trim())) - Number(/^20\d{2}$/.test(a.trim())));
  if (libro.length) {
    const eerr = nombres.find((n) => n === "EERR");
    usar("libro-movimientos", eerr ? [libro[0], eerr] : [libro[0]], eerr ? `Hoja «${libro[0]}» y base de reparto` : `Hoja «${libro[0]}»`);
  }

  // Bienes de uso: la hoja «Bienes de Uso» (el importador la busca por ese nombre) con su columna «Tipo de Bien».
  const bienes = hojas.find((h) => h.nombre === "Bienes de Uso" && tieneTitulo(h.filas, "TIPO DE BIEN"));
  if (bienes) usar("bienes-de-uso", [bienes.nombre], "Hoja «Bienes de Uso»");

  // Carteras: hojas «CPC…» y «CPP…» (o «Cuentas por cobrar / pagar…») que no estén vacías.
  for (const [modulo, clase] of [
    ["cuentas-por-cobrar", "cobrar"],
    ["cuentas-por-pagar", "pagar"],
  ] as const) {
    const hs = hojasDeCartera(nombres, clase).filter((n) => hojas.find((h) => h.nombre === n)?.filas.some((f) => (f ?? []).some((c) => normal(c) !== "")));
    if (hs.length) usar(modulo, hs, hs.map((h) => `«${h.trim()}»`).join(", "));
  }

  // Costos: hojas «MERCANCIA …» con «COSTO UNITARIO» (no «MERCANCIA DEFECTUOSA», que solo trae el coste de la pérdida)
  // y la hoja «MAPEO» de productos de Dropi.
  const mercancia = hojas
    .filter((h) => /^\s*MERCANC[IÍ]A\b/i.test(h.nombre) && h.filas.some((f) => (f ?? []).some((c) => normal(c) === "COSTO UNITARIO")))
    .map((h) => h.nombre);
  if (mercancia.length) {
    const mapeo = nombres.find((n) => n.trim().toUpperCase() === "MAPEO");
    usar("costos-mercancia", mapeo ? [...mercancia, mapeo] : mercancia, `${mercancia.length} hojas de mercancía${mapeo ? " y el mapeo con Dropi" : ""}`);
  }

  // Nómina: las hojas con los títulos de la planilla formal (salario mensual) o de la externa (total USDT).
  const comoNomina = (h: HojaMuestra) => ({ filas: h.filas.map((f) => (f ?? []).map(celdaNomina)) });
  const tipoNomina = detectarTipo(hojas.map(comoNomina));
  if (tipoNomina) {
    const hs = hojas.filter((h) => detectarTipo([comoNomina(h)]) === tipoNomina).map((h) => h.nombre);
    usar("nomina", hs, tipoNomina === "formal" ? "Planilla formal" : "Nómina externa (USDT)");
  }

  // Ventas: la hoja «Excel Matriz» con TIENDA, FECHA, N° Orden y TOTAL VENTA; también lee las guías, Monday y la base
  // de costo del mismo archivo.
  const matriz = hojas.find((h) => normal(h.nombre) === "EXCEL MATRIZ" && ubicarColumnasMatriz(h.filas) !== null);
  if (matriz) {
    const extra = nombres.filter((n) => ["INFORME SE", "MONDAY", "BASE COSTO ECOMFIVE"].includes(normal(n)));
    usar("ventas-tiendas", [matriz.nombre, ...extra], "Hoja «Excel Matriz»");
  }

  // Deliverys: la hoja con «NOMBRE DEL DELIVERY» y los bloques de tarifas.
  const gestion = hojas.find((h) => ubicarEstructura(h.filas) !== null);
  if (gestion) usar("deliverys", [gestion.nombre], `Hoja «${gestion.nombre}»`);

  // Conciliación: extractos de banco y hojas de Yappy, MiPOS o Servientrega que ningún otro módulo usa.
  const conc = hojas
    .filter((h) => !usadas.has(h.nombre))
    .map((h) => ({ nombre: h.nombre, formato: detectarHoja(h.filas) }))
    .filter((h): h is { nombre: string; formato: NonNullable<ReturnType<typeof detectarHoja>> } => h.formato !== null);
  if (conc.length) usar("conciliacion-bancaria", conc.map((h) => h.nombre), unicos(conc.map((h) => ETIQUETA_FORMATO[h.formato])).join(", "));

  return ordenar(salida);
}

/** Ordena lo reconocido según `ORDEN_CARGA`. */
export function ordenar<T extends { modulo: ModuloImportable }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => ORDEN_CARGA.indexOf(a.modulo) - ORDEN_CARGA.indexOf(b.modulo));
}

/** Lo reconocido que la persona puede cargar (módulos que puede abrir y modificar) y lo que no. */
export function separarPorPermiso<T extends { modulo: ModuloImportable }>(
  xs: T[],
  modulos: string[],
  soloLectura: string[],
): { permitidos: T[]; sinPermiso: T[] } {
  const puede = (m: string) => modulos.includes(m) && !soloLectura.includes(m);
  return { permitidos: xs.filter((x) => puede(x.modulo)), sinPermiso: xs.filter((x) => !puede(x.modulo)) };
}

/** Los módulos importables que esta persona puede modificar. */
export function modulosImportables(modulos: string[], soloLectura: string[]): ModuloImportable[] {
  return ORDEN_CARGA.filter((m) => modulos.includes(m) && !soloLectura.includes(m));
}

/** Un CSV (o TXT) de banco: lo lee el lector de extractos y entra como una sola hoja. */
export const esCsv = (archivo: string) => /\.(csv|txt)$/i.test(archivo);
