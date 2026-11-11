// Lectura de una hoja de Excel de nómina como filas de celdas simples. La comparten la pantalla «Importar» (en el
// navegador) y el script `scripts/finanzas/importar-nomina.ts`. El libro se lee con `cellDates: false` y `cellNF: true`
// (`leerLibroNomina`): así una fecha llega como número de serie y una hora («2:12», «26:58:00») como fracción de día, y
// se convierten aquí sin depender de la zona horaria del equipo (con `cellDates: true`, SheetJS arma fechas locales de
// 1899 y en Panamá las horas salían corridas 5 h 19 min).

import * as XLSX from "xlsx";
import type { Celda } from "./excel";

const DIA_MS = 86_400_000;

/** Serie de Excel (días desde 1899-12-30) → AAAA-MM-DD. */
export function fechaDeSerie(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie * DIA_MS)).toISOString().slice(0, 10);
}

/** Fracción de día → «H:MM» o «H:MM:SS» (las horas pueden pasar de 24: «26:58»). */
export function duracionDeFraccion(fraccion: number): string {
  const segundos = Math.round(Math.abs(fraccion) * 86_400);
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return `${h}:${String(m).padStart(2, "0")}${s ? `:${String(s).padStart(2, "0")}` : ""}`;
}

/** Abre un Excel para leer la nómina (ver arriba por qué sin `cellDates`). */
export function leerLibroNomina(datos: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(datos, { cellDates: false, cellNF: true });
}

/** Las filas de una hoja: fechas como «AAAA-MM-DD», horas como «H:MM», errores (#REF!) y vacías como null. */
export function filasDeHoja(ws: XLSX.WorkSheet | undefined): Celda[][] {
  if (!ws?.["!ref"]) return [];
  const rango = XLSX.utils.decode_range(ws["!ref"]);
  const filas: Celda[][] = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: Celda[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      fila.push(valorDeCelda(celda));
    }
    filas.push(fila);
  }
  // Las hojas traen cientos de filas vacías con formato al final: se recortan.
  while (filas.length && filas[filas.length - 1].every((v) => v === null)) filas.pop();
  return filas;
}

function valorDeCelda(c: XLSX.CellObject | undefined): Celda {
  if (!c || c.v === undefined || c.v === null) return null;
  if (c.t === "e") return null;
  if (c.t === "b") return Boolean(c.v);
  if (c.t === "d" && c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  if (c.t === "n" && typeof c.v === "number") {
    const formato = typeof c.z === "string" ? c.z : "";
    if (formato && formato !== "General" && XLSX.SSF.is_date(formato)) {
      // Una fecha real es una serie grande; lo chico es una duración (horas extra, tardanzas).
      return c.v >= 20_000 ? fechaDeSerie(c.v) : duracionDeFraccion(c.v);
    }
    return c.v;
  }
  const s = String(c.v).trim();
  return s === "" ? null : s;
}

/** Las hojas del libro como {nombre, filas}, en su orden. */
export function hojasDelLibro(libro: XLSX.WorkBook): { nombre: string; filas: Celda[][] }[] {
  return libro.SheetNames.map((nombre) => ({ nombre, filas: filasDeHoja(libro.Sheets[nombre]) }));
}
