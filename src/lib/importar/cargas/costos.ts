// Leer y cargar PRECIOS_DE_COSTE_MERCANCIA.xlsx (hojas «MERCANCIA …» y «MAPEO»). Lo usan la pantalla «Importar» de
// Costos de mercancía y el «Importar» universal.

import * as XLSX from "xlsx";
import { importarLotesCosto, terminarImportacionCostos } from "@/app/(app)/costos-mercancia/actions";
import { leerLotes, leerMapeo, type LoteCosto, type MapeoDropi } from "@/lib/finanzas/costos-excel";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


const LOTE = 400;

export interface LecturaCostos {
  archivo: string;
  porHoja: { hoja: string; lotes: LoteCosto[]; descartadas: number }[];
  mapeo: MapeoDropi[];
}

/** Las hojas de mercancía de un libro (por su nombre). */
export const hojasDeMercancia = (nombres: string[]) => nombres.filter((h) => /^\s*MERCANC[IÍ]A\b/i.test(h));

/**
 * Lee las hojas de mercancía y el mapeo con Dropi. `hojas` limita qué hojas de mercancía se leen (el universal pasa las
 * que reconoció); sin él, todas las «MERCANCIA …». null si no hay ninguna.
 */
export function leerCostos(datos: ArrayBuffer, archivo: string, hojas?: string[]): LecturaCostos | null {
  const wb = XLSX.read(datos, { cellDates: true });
  const filas = (h: string) => XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[h], { header: 1, raw: true, defval: null });
  const elegidas = hojasDeMercancia(wb.SheetNames).filter((h) => !hojas || hojas.includes(h));
  if (!elegidas.length) return null;
  const hojaMapeo = wb.SheetNames.find((h) => h.trim().toUpperCase() === "MAPEO");
  return { archivo, porHoja: elegidas.map((h) => ({ hoja: h, ...leerLotes(filas(h), h) })), mapeo: hojaMapeo ? leerMapeo(filas(hojaMapeo)) : [] };
}

/** Carga los lotes de costo y termina (borra los lotes viejos de esas hojas y guarda el mapeo). */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarCostos(lectura: LecturaCostos, avance: Avance): Promise<{ error: string } | { borrados: number; mapeos: number; rechazados: number }> {
  const bitacora = await iniciarImportacion("costos-mercancia", lectura.archivo).catch(() => null);
  const r = await cargarCostosInterno(bitacora, lectura, avance);
  if ("error" in r) await terminarBitacora(bitacora, "costos-mercancia", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarCostosInterno(bitacora: string | null, lectura: LecturaCostos, avance: Avance): Promise<{ error: string } | { borrados: number; mapeos: number; rechazados: number }> {
  const todos = lectura.porHoja.flatMap((h) => h.lotes);
  let rechazados = 0;
  avance(0, todos.length);
  for (let i = 0; i < todos.length; i += LOTE) {
    const r = await importarLotesCosto(lectura.archivo, todos.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return { error: mensajeLoteFallido(i, todos.length, r.error) };
    rechazados += r.rechazados;
    avance(Math.min(i + LOTE, todos.length), todos.length);
  }
  const porHoja = Object.fromEntries(lectura.porHoja.map((h) => [h.hoja, h.lotes.map((l) => l.origen_clave)]));
  const fin = await terminarImportacionCostos(lectura.archivo, porHoja, lectura.mapeo).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, "costos-mercancia", "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return { error: fin.error };
  }
  await terminarBitacora(bitacora, "costos-mercancia", "terminada", {
    actualizadas: todos.length - rechazados,
    saltadas: rechazados,
    borradas: fin.borrados,
    detalle: [`${todos.length} lotes`, `${fin.mapeos} mapeos`],
  }).catch(() => undefined);
  return { borrados: fin.borrados, mapeos: fin.mapeos, rechazados };
}
