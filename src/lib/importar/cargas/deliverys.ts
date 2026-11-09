// Leer y cargar GESTION_DELIVERYS_<mes>.xlsx. Lo usan la pantalla «Importar» de Deliverys y el «Importar» universal.

import { asignarNombresDeliverys, importarLoteDeliverys, terminarImportacionDeliverys, type ResumenImportacion } from "@/app/(app)/deliverys/importar/actions";
import { leerGestionDeliverys, type LecturaDeliverys } from "@/lib/deliverys/excel";
import { leerHojaDeliverys } from "@/lib/deliverys/hoja";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


const LOTE = 400;
/** En la asignación de nombres: crear un repartidor nuevo con ese nombre. */
export const NUEVO_REPARTIDOR = "nuevo";

/** Lee la hoja de gestión. null si el libro no la tiene o no trae entregas. */
export function leerDeliverys(datos: ArrayBuffer): LecturaDeliverys | null {
  const hoja = leerHojaDeliverys(datos);
  const l = hoja ? leerGestionDeliverys(hoja.filas) : null;
  return l && l.entregas.length ? l : null;
}

/** La asignación de partida de los nombres sin dueño: la sugerencia o, si no hay, un repartidor nuevo. */
export const asignacionInicial = (r: ResumenImportacion): Record<string, string> => Object.fromEntries(r.sinDueno.map((x) => [x.etiqueta, x.sugerido ?? NUEVO_REPARTIDOR]));

/** Asigna los nombres sin dueño, carga las líneas por lotes y termina (borra lo que ya no vino, nunca de semanas cerradas). */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarDeliverys(archivo: string, lectura: LecturaDeliverys, resumen: ResumenImportacion, asignacion: Record<string, string>, avance: Avance): Promise<{ error: string } | { borradas: number; conservadas: number; rechazadas: number; sinRepartidor: number; creados: number }> {
  const bitacora = await iniciarImportacion("deliverys", archivo).catch(() => null);
  const r = await cargarDeliverysInterno(bitacora, archivo, lectura, resumen, asignacion, avance);
  if ("error" in r) await terminarBitacora(bitacora, "deliverys", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarDeliverysInterno(bitacora: string | null, archivo: string, lectura: LecturaDeliverys, resumen: ResumenImportacion, asignacion: Record<string, string>, avance: Avance): Promise<{ error: string } | { borradas: number; conservadas: number; rechazadas: number; sinRepartidor: number; creados: number }> {
  avance(0, lectura.entregas.length);
  let creados = 0;
  if (resumen.sinDueno.length) {
    const a = await asignarNombresDeliverys(
      resumen.sinDueno.map((x) => ({ etiqueta: x.etiqueta, repartidorId: asignacion[x.etiqueta] === NUEVO_REPARTIDOR ? null : asignacion[x.etiqueta] })),
    ).catch(cortada);
    if ("error" in a) return { error: `No se pudieron asignar los nombres: ${a.error}.` };
    creados = a.creados;
  }
  const lineas = [...lectura.entregas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let conservadas = 0;
  let rechazadas = 0;
  let sinRepartidor = 0;
  for (let i = 0; i < lineas.length; i += LOTE) {
    const r = await importarLoteDeliverys(archivo, lineas.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return { error: mensajeLoteFallido(i, lineas.length, r.error) };
    conservadas += r.conservadas;
    rechazadas += r.rechazadas + r.sinTienda;
    sinRepartidor += r.sinRepartidor;
    avance(Math.min(i + LOTE, lineas.length), lineas.length);
  }
  const fin = await terminarImportacionDeliverys(archivo, lineas.map((l) => l.origen_clave), lectura.desde, lectura.hasta).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, "deliverys", "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return { error: fin.error };
  }
  await terminarBitacora(bitacora, "deliverys", "terminada", {
    actualizadas: lineas.length - conservadas - rechazadas,
    saltadas: conservadas + rechazadas,
    borradas: fin.borradas,
    detalle: [`${lineas.length} líneas`, ...(creados ? [`${creados} repartidores nuevos`] : [])],
  }).catch(() => undefined);
  return { borradas: fin.borradas, conservadas, rechazadas, sinRepartidor, creados };
}
