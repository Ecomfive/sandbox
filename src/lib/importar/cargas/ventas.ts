// Leer y cargar GESTION_OCEANS_PANAMA.xlsx (hoja «Excel Matriz» con las guías, Monday y la base de costo). Lo usan la
// pantalla «Importar» de Ventas por tienda y el «Importar» universal.

import * as XLSX from "xlsx";
import { importarLoteVentas, terminarImportacionVentas } from "@/app/(app)/ventas-tiendas/importar/actions";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { complementos, leerGuias, leerMapeoProductos, leerMatriz, leerMonday, type FilaDescartada, type OrdenVenta } from "@/lib/ventas/matriz";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";


/** El mismo tamaño de lote que acepta el servidor (`TAMANO_LOTE_VENTAS`): un lote de 400 órdenes ronda los 450 KB. */
const LOTE = 400;
const HOJA_MATRIZ = "EXCEL MATRIZ";

export interface LecturaVentas {
  archivo: string;
  ordenes: OrdenVenta[];
  lineas: number;
  descartadas: FilaDescartada[];
  mapeo: ReturnType<typeof leerMapeoProductos>;
  guias: number;
}

/**
 * Lee la matriz con sus complementos. `{ error }` con el motivo si no se puede (sin la hoja o sin órdenes).
 */
export function leerVentas(datos: ArrayBuffer, archivo: string): LecturaVentas | { error: string } {
  const wb = XLSX.read(datos, { dense: true });
  const hoja = (nombre: string): Celda[][] => {
    const n = wb.SheetNames.find((h) => h.trim().toUpperCase() === nombre);
    return n ? XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[n], { header: 1, raw: true, defval: null }) : [];
  };
  const matriz = hoja(HOJA_MATRIZ);
  if (!matriz.length) return { error: "No encontré la hoja «Excel Matriz»." };
  const guias = leerGuias(hoja("INFORME SE"));
  const { ordenes, descartadas, lineas } = leerMatriz(matriz, complementos(guias, leerMonday(hoja("MONDAY"))));
  if (!ordenes.length) return { error: "La hoja «Excel Matriz» no trae órdenes (¿tiene las columnas TIENDA, FECHA, N° Orden y TOTAL VENTA?)." };
  return { archivo, ordenes, lineas, descartadas, mapeo: leerMapeoProductos(hoja("BASE COSTO ECOMFIVE")), guias: guias.size };
}

export interface ResultadoCargaVentas {
  nuevas: number;
  actualizadas: number;
  sinCambios: number;
  rechazadas: number;
  mapeos: number;
  tiendasNuevas: string[];
}

/** Carga las órdenes elegidas por lotes y termina (guarda el mapeo de productos). */
/** Carga con la bitácora (migración 0925): la abre antes de escribir (las filas nuevas se reconocen por su fecha de creación) y la cierra aunque falle a mitad. */
export async function cargarVentas(lectura: LecturaVentas, elegidas: OrdenVenta[], avance: Avance): Promise<{ error: string } | ResultadoCargaVentas> {
  const bitacora = await iniciarImportacion("ventas-tiendas", lectura.archivo).catch(() => null);
  const r = await cargarVentasInterno(bitacora, lectura, elegidas, avance);
  if ("error" in r) await terminarBitacora(bitacora, "ventas-tiendas", "fallida", { detalle: [r.error] }).catch(() => undefined);
  return r;
}

async function cargarVentasInterno(bitacora: string | null, lectura: LecturaVentas, elegidas: OrdenVenta[], avance: Avance): Promise<{ error: string } | ResultadoCargaVentas> {
  let nuevas = 0;
  let actualizadas = 0;
  let sinCambios = 0;
  let rechazadas = 0;
  const tiendasNuevas = new Set<string>();
  avance(0, elegidas.length);
  for (let i = 0; i < elegidas.length; i += LOTE) {
    const r = await importarLoteVentas(lectura.archivo, elegidas.slice(i, i + LOTE)).catch(cortada);
    if ("error" in r) return { error: mensajeLoteFallido(i, elegidas.length, r.error) };
    nuevas += r.nuevas;
    actualizadas += r.actualizadas;
    sinCambios += r.sinCambios;
    rechazadas += r.rechazadas;
    r.tiendasNuevas.forEach((t) => tiendasNuevas.add(t));
    avance(Math.min(i + LOTE, elegidas.length), elegidas.length);
  }
  const meses = [...new Set(elegidas.map((o) => o.periodo))].sort().map((m) => m.slice(0, 7));
  const fin = await terminarImportacionVentas(lectura.archivo, lectura.mapeo, { ordenes: elegidas.length, meses }).catch(cortada);
  if ("error" in fin) {
    await terminarBitacora(bitacora, "ventas-tiendas", "fallida", { detalle: [fin.error] }).catch(() => undefined);
    return { error: fin.error };
  }
  await terminarBitacora(bitacora, "ventas-tiendas", "terminada", {
    nuevas,
    actualizadas,
    saltadas: sinCambios + rechazadas,
    detalle: [`${elegidas.length} órdenes (${meses.join(", ")})`],
  }).catch(() => undefined);
  return { nuevas, actualizadas, sinCambios, rechazadas, mapeos: fin.mapeos, tiendasNuevas: [...tiendasNuevas] };
}
