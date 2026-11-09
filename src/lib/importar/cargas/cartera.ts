// Leer y cargar las cuentas por cobrar («CPC») o por pagar («CPP…») del Excel de gastos. Lo usan la pantalla
// «Importar Excel» de cada cartera y el «Importar» universal.

import * as XLSX from "xlsx";
import { importarLoteCartera, terminarImportacionCartera } from "@/lib/finanzas/cartera-actions";
import { leerCartera, type LecturaCartera } from "@/lib/finanzas/cxc-cxp-excel";
import { TAMANO_LOTE_IMPORTACION, saldoDe, type Clase } from "@/lib/finanzas/cxc-cxp";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


/** Lee las hojas de esa cartera del libro (`hojas` vacío si no tiene ninguna). */
export function leerArchivoCartera(datos: ArrayBuffer, clase: Clase): LecturaCartera {
  const wb = XLSX.read(datos, { cellDates: true });
  const filasDe = (h: string) => XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[h], { header: 1, raw: true, defval: null });
  return leerCartera(wb.SheetNames, filasDe, clase);
}

/** El saldo abierto de lo leído (lo que se debe o se cobra todavía). */
export const saldoLeido = (l: LecturaCartera) => l.documentos.reduce((a, d) => a + Math.max(saldoDe(d), 0), 0);

/** Carga los documentos con sus abonos por lotes y termina (borra lo de esas hojas que ya no vino). */
export async function cargarCartera(
  clase: Clase,
  archivo: string,
  lectura: LecturaCartera,
  avance: Avance,
): Promise<{ error: string } | { borrados: number; conservados: number; rechazados: number; tiendas: string[] }> {
  const modulo = clase === "cobrar" ? "cuentas-por-cobrar" : "cuentas-por-pagar";
  // La bitácora se abre antes de escribir: las filas nuevas se reconocen por su fecha de creación.
  const bitacora = await iniciarImportacion(modulo, archivo).catch(() => null);
  const r = await cargarCarteraInterno(bitacora, modulo, clase, archivo, lectura, avance);
  if ("error" in r) await terminarBitacora(bitacora, modulo, "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarCarteraInterno(
  bitacora: string | null,
  modulo: string,
  clase: Clase,
  archivo: string,
  lectura: LecturaCartera,
  avance: Avance,
): Promise<{ error: string } | { borrados: number; conservados: number; rechazados: number; tiendas: string[] }> {
  const docs = lectura.documentos;
  let rechazados = 0;
  const tiendas = new Set<string>();
  avance(0, docs.length);
  for (let i = 0; i < docs.length; i += TAMANO_LOTE_IMPORTACION) {
    const r = await importarLoteCartera(clase, archivo, docs.slice(i, i + TAMANO_LOTE_IMPORTACION)).catch(cortada);
    if ("error" in r) return { error: mensajeLoteFallido(i, docs.length, r.error) };
    rechazados += r.rechazados;
    r.tiendasDesconocidas.forEach((t) => tiendas.add(t));
    avance(Math.min(i + TAMANO_LOTE_IMPORTACION, docs.length), docs.length);
  }
  const fin = await terminarImportacionCartera(clase, archivo, lectura.hojas, docs.map((d) => d.origen_clave), { documentos: docs.length, saldo: saldoLeido(lectura) }).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, modulo, "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return { error: fin.error };
  }
  await terminarBitacora(bitacora, modulo, "terminada", {
    actualizadas: docs.length - rechazados,
    saltadas: fin.conservados + rechazados,
    borradas: fin.borrados,
    detalle: [`${docs.length} documentos`],
  }).catch(() => undefined);
  return { borrados: fin.borrados, conservados: fin.conservados, rechazados, tiendas: [...tiendas] };
}
