// Abre GESTION_DELIVERYS_<mes>.xlsx y devuelve las filas de la hoja «GESTION DELIVERY II» como celdas simples. La
// comparten la pantalla «Importar» (en el navegador) y `scripts/finanzas/importar-deliverys.ts`.

import * as XLSX from "xlsx";
import type { Celda } from "../finanzas/libro-excel";
import { HOJA_GESTION, ubicarEstructura } from "./excel";

/** Las celdas de una hoja: lo que guardó el Excel (el resultado de cada fórmula); un error (#REF!) o una vacía, null. */
function filasDeHoja(ws: XLSX.WorkSheet | undefined): Celda[][] {
  if (!ws?.["!ref"]) return [];
  const rango = XLSX.utils.decode_range(ws["!ref"]);
  const filas: Celda[][] = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: Celda[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      // Un error guarda su código como número: no es una cantidad.
      fila.push(!celda || celda.t === "e" || celda.t === "z" ? null : (celda.v as Celda));
    }
    filas.push(fila);
  }
  return filas;
}

/**
 * La hoja de gestión: la que se llama «GESTION DELIVERY II» o, si se renombró, la primera que tenga su estructura
 * (la fila con «NOMBRE DEL DELIVERY» y los bloques por tarifa).
 */
export function leerHojaDeliverys(datos: ArrayBuffer | Uint8Array): { hoja: string; filas: Celda[][] } | null {
  const libro = XLSX.read(datos, { cellDates: false });
  const nombres = [HOJA_GESTION, ...libro.SheetNames.filter((n) => n !== HOJA_GESTION)];
  for (const n of nombres) {
    if (!libro.Sheets[n]) continue;
    const filas = filasDeHoja(libro.Sheets[n]);
    if (ubicarEstructura(filas)) return { hoja: n, filas };
  }
  return null;
}
