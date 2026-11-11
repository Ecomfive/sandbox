// Leer y cargar el libro de conciliaciones (extractos de banco, Yappy, MiPOS, Servientrega) o un CSV del banco. Lo usan
// la pantalla «Importar» de Conciliación bancaria y el «Importar» universal.

import * as XLSX from "xlsx";
import { importarCobros, importarLineas, importarOrdenes, terminarImportacion } from "@/app/(app)/conciliacion-bancaria/importar/actions";
import { leerHoja, type HojaLeida } from "@/lib/conciliacion/leer-excel";
import { parseExtracto } from "@/lib/extractos/parse";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


const LOTE = 400;

export const esExtracto = (h: HojaLeida) => h.lineas.length > 0;

/**
 * Las hojas que se concilian, ya leídas. Un CSV o TXT del banco lo lee el mismo lector de Extractos bancarios. `hojas`
 * limita qué hojas del Excel se leen (el universal pasa las que reconoció).
 */
export function leerConciliacion(datos: ArrayBuffer, archivo: string, hojas?: string[]): HojaLeida[] {
  if (/\.(csv|txt)$/i.test(archivo)) {
    const { headers, filas } = parseExtracto(datos);
    const hoja = leerHoja(archivo.replace(/\.(csv|txt)$/i, ""), [headers, ...filas] as Celda[][]);
    return hoja ? [hoja] : [];
  }
  const wb = XLSX.read(datos, { cellDates: true });
  return wb.SheetNames.filter((h) => !hojas || hojas.includes(h))
    .map((h) => leerHoja(h, XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[h], { header: 1, raw: true, defval: null })))
    .filter((h): h is HojaLeida => h !== null && (h.lineas.length > 0 || h.cobros.length > 0));
}

/**
 * Carga cobros, órdenes y las líneas de cada extracto en su cuenta (`cuentaDe`: hoja → id de cuenta; sin cuenta, la
 * hoja no se importa) y termina buscando coincidencias en cada cuenta y mes que tocó.
 */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarConciliacion(archivo: string, hojas: HojaLeida[], cuentaDe: Record<string, string>, avance: Avance): Promise<{ error: string } | { auto: number; sugeridas: number; pendientes: number; rechazados: number; nuevas: number }> {
  const bitacora = await iniciarImportacion("conciliacion-bancaria", archivo).catch(() => null);
  const r = await cargarConciliacionInterno(bitacora, archivo, hojas, cuentaDe, avance);
  if ("error" in r) await terminarBitacora(bitacora, "conciliacion-bancaria", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarConciliacionInterno(bitacora: string | null, archivo: string, hojas: HojaLeida[], cuentaDe: Record<string, string>, avance: Avance): Promise<{ error: string } | { auto: number; sugeridas: number; pendientes: number; rechazados: number; nuevas: number }> {
  const cobros = hojas.flatMap((h) => h.cobros);
  // Las órdenes que trae una hoja de extracto que no se importa, tampoco.
  const ordenes = hojas.filter((h) => !esExtracto(h) || cuentaDe[h.hoja]).flatMap((h) => h.ordenes);
  const extractos = hojas.filter((h) => esExtracto(h) && cuentaDe[h.hoja]);
  const total = cobros.length + ordenes.length + extractos.reduce((a, h) => a + h.lineas.length, 0);
  let hechos = 0;
  let rechazados = 0;
  let nuevas = 0;
  const avanzar = (n: number, mensaje: string) => {
    hechos += n;
    avance(hechos, total, mensaje);
  };
  const fallo = (e: string) => ({ error: mensajeLoteFallido(hechos, total, e) });

  avance(0, total, "Cargando cobros…");
  for (let i = 0; i < cobros.length; i += LOTE) {
    const r = await importarCobros(cobros.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return fallo(r.error);
    rechazados += r.rechazados;
    avanzar(Math.min(LOTE, cobros.length - i), "Cargando cobros…");
  }
  for (let i = 0; i < ordenes.length; i += LOTE) {
    const r = await importarOrdenes(ordenes.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return fallo(r.error);
    rechazados += r.rechazados;
    avanzar(Math.min(LOTE, ordenes.length - i), "Cargando órdenes…");
  }
  const tocados = new Map<string, { cuentaId: string; mes: string }>();
  for (const h of extractos) {
    const cuentaId = cuentaDe[h.hoja];
    for (let i = 0; i < h.lineas.length; i += LOTE) {
      const r = await importarLineas(cuentaId, archivo, h.hoja, h.formato, h.lineas.slice(i, i + LOTE)).catch(cortada);
      if ("error" in r) return fallo(r.error);
      rechazados += r.rechazados;
      nuevas += r.nuevas;
      avanzar(Math.min(LOTE, h.lineas.length - i), `Cargando ${h.hoja}…`);
    }
    for (const l of h.lineas) tocados.set(`${cuentaId}|${l.fecha.slice(0, 7)}`, { cuentaId, mes: `${l.fecha.slice(0, 7)}-01` });
  }
  avance(hechos, total, "Buscando coincidencias…");
  const fin = await terminarImportacion(archivo, [...tocados.values()], {
    lineas: extractos.reduce((a, h) => a + h.lineas.length, 0),
    cobros: cobros.length,
    ordenes: ordenes.length,
  }).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, "conciliacion-bancaria", "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return fallo(fin.error);
  }
  await terminarBitacora(bitacora, "conciliacion-bancaria", "terminada", {
    nuevas,
    actualizadas: Math.max(0, total - nuevas - rechazados),
    saltadas: rechazados,
    detalle: [`${fin.auto} conciliadas solas`, `${fin.sugeridas} sugeridas`, `${fin.pendientes} pendientes`],
  }).catch(() => undefined);
  return { ...fin, rechazados, nuevas };
}
