// Leer y cargar la hoja «Bienes de Uso» del Excel de gastos. Lo usan la pantalla «Importar» de Bienes de uso y el
// «Importar» universal.

import * as XLSX from "xlsx";
import { importarBienes } from "@/app/(app)/bienes-de-uso/actions";
import { compararConGrilla, leerBienesExcel, type BienExcel } from "@/lib/finanzas/bienes-uso";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { cortada } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


export const HOJA_BIENES = "Bienes de Uso";

export interface LecturaBienes {
  archivo: string;
  bienes: BienExcel[];
  descartadas: { fila: number; motivo: string }[];
  /** Cuántas celdas de la grilla de depreciación del Excel no coinciden con el cálculo del portal. */
  grilla: { celdas: number; distintas: number; filas: number[]; sinGrilla: boolean } | null;
}

/** Lee la hoja y la compara con la grilla de depreciación del Excel. null si el archivo no tiene la hoja. */
export function leerBienes(datos: ArrayBuffer, archivo: string): LecturaBienes | null {
  const wb = XLSX.read(datos, { cellDates: true, sheets: [HOJA_BIENES] });
  const ws = wb.Sheets[HOJA_BIENES];
  if (!ws) return null;
  const { bienes, descartadas } = leerBienesExcel(XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null }), archivo);
  const meses = [...new Set(bienes.flatMap((b) => Object.keys(b.grilla)))].sort();
  const r = meses.length ? compararConGrilla(bienes, meses) : null;
  return {
    archivo,
    bienes,
    descartadas,
    grilla: r
      ? {
          celdas: r.celdas,
          distintas: r.distintas.length,
          filas: [...new Set(r.distintas.map((d) => d.fila))],
          sinGrilla: r.distintas.every((d) => !Object.keys(bienes.find((b) => b.fila === d.fila)?.grilla ?? {}).length),
        }
      : null,
  };
}

/** Carga los bienes de una vez (sin la grilla: no hace falta en el servidor). */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarBienes(lectura: LecturaBienes): Promise<{ error: string } | { guardados: number; conservados: number; borrados: number; rechazados: number }> {
  const bitacora = await iniciarImportacion("bienes-de-uso", lectura.archivo).catch(() => null);
  const r = await cargarBienesInterno(bitacora, lectura);
  if ("error" in r) await terminarBitacora(bitacora, "bienes-de-uso", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarBienesInterno(bitacora: string | null, lectura: LecturaBienes): Promise<{ error: string } | { guardados: number; conservados: number; borrados: number; rechazados: number }> {
  const r = await importarBienes(
    lectura.archivo,
    lectura.bienes.map((b) => ({ ...b, grilla: undefined })),
  ).catch(cortada);
  await terminarBitacora(bitacora, "bienes-de-uso", "error" in r ? "fallida" : "terminada",
    "error" in r ? { detalle: [r.error] } : { actualizadas: r.guardados, saltadas: r.conservados + r.rechazados, borradas: r.borrados, detalle: [`${r.guardados} bienes guardados`] },
  ).catch(() => undefined);
  return r;
}
