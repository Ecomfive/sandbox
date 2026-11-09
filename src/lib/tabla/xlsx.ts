// Excel (.xlsx) de lo que se ve en una tabla: las mismas columnas y filas que el CSV, pero en un archivo que Excel abre bien (el CSV con comas
// se abre en una sola columna en un Excel en español). Los números van como números (se pueden sumar y ordenar), las fechas como fechas, el texto
// como texto (un código de barras no se vuelve «2E+12»), la fila de títulos con fondo y fija, filtros y columnas del ancho de su contenido.
// Se carga solo al pulsar «Excel» (ExcelJS pesa).

import { filasAXlsx, type CeldaExcel, type ColumnaExcel } from "@/lib/proveedor/excel";
import { columnasDeDescarga, type CeldaCsv } from "./csv";
import type { DefTabla } from "./motor";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ANCHO_MINIMO = 8;
const ANCHO_MAXIMO = 48;

/** Cómo se guarda una columna según lo que trae: todo número → número (entero o con decimales); fechas ISO → fecha; lo demás, texto. */
export function tipoDeColumna(tipo: string, valores: CeldaCsv[]): NonNullable<ColumnaExcel["tipo"]> {
  const llenos = valores.filter((v) => v !== null && v !== undefined && v !== "");
  if (llenos.length === 0) return "texto";
  if (llenos.every((v) => typeof v === "number" && Number.isFinite(v))) return llenos.every((v) => Number.isInteger(v as number)) ? "entero" : "dinero";
  if (tipo === "fecha" && llenos.every((v) => typeof v === "string" && ES_FECHA.test(v))) return "fecha";
  return "texto";
}

/** El ancho (en caracteres) que necesita una columna: el de su título o su dato más largo, entre un mínimo y un máximo. */
export function anchoDeColumna(titulo: string, valores: CeldaCsv[]): number {
  const mayor = valores.reduce<number>((m, v) => Math.max(m, v === null || v === undefined ? 0 : String(v).length), titulo.length);
  return Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, mayor + 2));
}

/** «wms-stock-2026-11-09.xlsx»: la clave de la tabla y el día. */
export function nombreArchivoXlsx(clave: string, fecha: Date): string {
  return `${clave}-${fecha.toISOString().slice(0, 10)}.xlsx`;
}

export async function tablaAXlsx<F>(def: DefTabla<F>, filas: F[], titulo: string): Promise<Uint8Array> {
  const columnas = columnasDeDescarga(def, filas);
  const datos = columnas.map((c) => filas.map((f) => c.valor(f)));
  const definicion: ColumnaExcel[] = columnas.map((c, j) => ({ titulo: c.etiqueta, tipo: tipoDeColumna(c.tipo, datos[j]), ancho: anchoDeColumna(c.etiqueta, datos[j]) }));
  const celdas: CeldaExcel[][] = filas.map((_, i) => columnas.map((__, j) => (datos[j][i] === undefined ? null : datos[j][i])));
  return filasAXlsx(titulo, definicion, celdas, undefined, { fondoTitulos: true });
}
