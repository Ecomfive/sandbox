// Leer y cargar PLANILLA_FORMAL_PANAMA.xlsx o NOMINA_EXTRANJERA.xlsx. Lo usan la pantalla «Importar» de Nómina y el
// «Importar» universal.

import { importarLoteNomina, terminarImportacionNomina } from "@/app/(app)/nomina/importar/actions";
import { leerNomina, type LecturaNomina } from "@/lib/nomina/excel";
import { hojasDelLibro, leerLibroNomina } from "@/lib/nomina/hoja";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


const LOTE = 400;

/** Lee la nómina del libro. null si no tiene hojas de nómina. */
export function leerArchivoNomina(datos: ArrayBuffer): LecturaNomina | null {
  const l = leerNomina(hojasDelLibro(leerLibroNomina(datos)));
  return l && l.lineas.length ? l : null;
}

export interface ResultadoCargaNomina {
  borrados: number;
  personasNuevas: number;
  conservados: number;
  rechazadas: number;
  tiendasNuevas: string[];
  enMesCerrado: number;
}

/** Carga las líneas por lotes (de la más vieja a la más nueva) y termina (comisión y total de cada mes). */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarNomina(archivo: string, lectura: LecturaNomina, avance: Avance): Promise<{ error: string } | ResultadoCargaNomina> {
  const bitacora = await iniciarImportacion("nomina", archivo).catch(() => null);
  const r = await cargarNominaInterno(bitacora, archivo, lectura, avance);
  if ("error" in r) await terminarBitacora(bitacora, "nomina", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarNominaInterno(bitacora: string | null, archivo: string, lectura: LecturaNomina, avance: Avance): Promise<{ error: string } | ResultadoCargaNomina> {
  const lineas = [...lectura.lineas].sort((a, b) => a.periodo.localeCompare(b.periodo));
  let personasNuevas = 0;
  let conservados = 0;
  let rechazadas = 0;
  let enMesCerrado = 0;
  const tiendas = new Set<string>();
  avance(0, lineas.length);
  for (let i = 0; i < lineas.length; i += LOTE) {
    const r = await importarLoteNomina(archivo, lineas.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return { error: mensajeLoteFallido(i, lineas.length, r.error) };
    personasNuevas += r.personasNuevas;
    conservados += r.conservados;
    rechazadas += r.rechazadas;
    enMesCerrado += r.enMesCerrado;
    r.tiendasNuevas.forEach((t) => tiendas.add(t));
    avance(Math.min(i + LOTE, lineas.length), lineas.length);
  }
  const fin = await terminarImportacionNomina(archivo, lineas.map((l) => l.origen_clave), lectura.periodos, lectura.tipo).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, "nomina", "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return { error: fin.error };
  }
  await terminarBitacora(bitacora, "nomina", "terminada", {
    actualizadas: lineas.length - conservados - rechazadas - enMesCerrado,
    saltadas: conservados + rechazadas + enMesCerrado + fin.enMesCerrado,
    borradas: fin.borrados,
    detalle: [`${lineas.length} pagos`, ...(personasNuevas ? [`${personasNuevas} personas nuevas`] : [])],
  }).catch(() => undefined);
  return { borrados: fin.borrados, personasNuevas, conservados, rechazadas, tiendasNuevas: [...tiendas], enMesCerrado: enMesCerrado + fin.enMesCerrado };
}
