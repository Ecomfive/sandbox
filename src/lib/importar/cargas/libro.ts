// Leer y cargar el libro de movimientos (hoja del año de GASTOS_PANAMA_<año>.xlsx). Lo usan la pantalla
// «Importar Excel» del libro y el «Importar» universal: la lectura es en el navegador y la carga va por lotes a las
// mismas acciones del servidor, que vuelven a validar todo.

import * as XLSX from "xlsx";
import { importarLote, leerCargadoDelArchivo, terminarImportacion } from "@/app/(app)/libro-movimientos/importar/actions";
import { compararLibro, type Comparacion, type FilaComparable } from "@/lib/finanzas/comparar-libro";
import { iniciarImportacion, terminarBitacora } from "@/lib/importar/bitacora-actions";
import { leerBaseDistribucion, leerLibro, ubicarColumnas, type BaseExcel, type Celda, type Descartada, type MovimientoExcel } from "@/lib/finanzas/libro-excel";
import { cortada, mensajeLoteFallido, type Avance } from "./comun";

/** El mismo tamaño de lote que acepta el servidor (`TAMANO_LOTE`): cada envío queda lejos del límite de 1 MB. */
const LOTE = 400;

/** Las hojas que tienen la fila de títulos del libro (MES, TIENDA, TIPO, USD); primero la que se llama como un año. */
export function hojasDelLibro(libro: XLSX.WorkBook): string[] {
  // Solo las primeras 30 filas de cada hoja: algunas tienen decenas de miles y aquí basta con los títulos.
  const filas = (h: string) => {
    const ws = libro.Sheets[h];
    if (!ws?.["!ref"]) return [];
    const r = XLSX.utils.decode_range(ws["!ref"]);
    r.e.r = Math.min(r.e.r, r.s.r + 29);
    return XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null, range: XLSX.utils.encode_range(r) });
  };
  const validas = libro.SheetNames.filter((h) => ubicarColumnas(filas(h)) !== null);
  return validas.sort((a, b) => Number(/^20\d{2}$/.test(b.trim())) - Number(/^20\d{2}$/.test(a.trim())));
}

/** Abre el Excel del libro (con fechas como fechas, como lo lee el importador). */
export const abrirLibro = (datos: ArrayBuffer) => XLSX.read(datos, { cellDates: true });

/** Los movimientos de una hoja y la base de reparto de la hoja «EERR», si la hay. */
/** `moneda`: la del libro (la de su entidad); sin ella, la que diga el archivo o USD. */
export function leerHojaLibro(wb: XLSX.WorkBook, archivo: string, hoja: string, moneda?: string): { movimientos: MovimientoExcel[]; descartadas: Descartada[]; base: BaseExcel[] } {
  const filas = XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
  const { movimientos, descartadas } = leerLibro(filas, archivo, moneda ? { moneda } : undefined);
  const base = wb.Sheets.EERR ? leerBaseDistribucion(XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets.EERR, { header: 1, raw: true, defval: null })) : [];
  return { movimientos, descartadas, base };
}

export interface ResultadoCargaLibro {
  borrados: number;
  base: number;
  tiendasNuevas: string[];
  sinTipo: number;
  rechazados: number;
  conservados: number;
  porRegla: number;
  enMesCerrado: number;
  /** Movimientos en otra moneda sin la tasa de su mes (no entran al EERR hasta cargarla). */
  sinTasa: number;
}

/** Carga los movimientos por lotes y termina (borra lo que ya no vino y guarda la base de reparto). */
/** `codigoEntidad`: la entidad del libro (Panamá si no se pasa). */
export async function cargarLibro(
  archivo: string,
  movimientos: MovimientoExcel[],
  base: BaseExcel[],
  avance: Avance,
  codigoEntidad?: string,
): Promise<{ error: string } | ResultadoCargaLibro> {
  const tiendasNuevas = new Set<string>();
  let sinTipo = 0;
  let rechazados = 0;
  let conservados = 0;
  let porRegla = 0;
  let enMesCerrado = 0;
  let sinTasa = 0;
  let nuevos = 0;
  let guardados = 0;
  avance(0, movimientos.length);
  // La bitácora (migración 0925): sin ella `bitacora` es null y todo sigue igual.
  const bitacora = await iniciarImportacion("libro-movimientos", archivo).catch(() => null);
  const fallar = async (error: string) => {
    await terminarBitacora(bitacora, "libro-movimientos", "fallida", { nuevas: nuevos, actualizadas: guardados - nuevos, detalle: [error] }).catch(() => undefined);
    return { error };
  };
  for (let i = 0; i < movimientos.length; i += LOTE) {
    const r = await importarLote(archivo, movimientos.slice(i, i + LOTE), codigoEntidad, bitacora).catch(cortada);
    if ("error" in r) return fallar(mensajeLoteFallido(i, movimientos.length, r.error));
    nuevos += r.nuevos ?? 0;
    guardados += r.guardados;
    r.tiendasNuevas.forEach((t) => tiendasNuevas.add(t));
    sinTipo += r.sinTipo;
    rechazados += r.rechazados;
    conservados += r.conservados;
    porRegla += r.porRegla;
    enMesCerrado += r.enMesCerrado;
    sinTasa += r.sinTasa ?? 0;
    avance(Math.min(i + LOTE, movimientos.length), movimientos.length);
  }
  const meses = [...new Set(movimientos.map((m) => m.periodo.slice(0, 7)))].sort();
  const fin = await terminarImportacion(archivo, movimientos.map((m) => m.origen_clave), base, { movimientos: movimientos.length, meses }, codigoEntidad).catch(cortada);
  if ("error" in fin) return fallar(fin.error);
  await terminarBitacora(bitacora, "libro-movimientos", "terminada", {
    nuevas: nuevos,
    actualizadas: guardados - nuevos,
    saltadas: conservados + rechazados + enMesCerrado + fin.enMesCerrado,
    borradas: fin.borrados,
    detalle: [
      `${movimientos.length} movimientos en el archivo`,
      ...(sinTipo ? [`${sinTipo} sin tipo`] : []),
      ...(conservados ? [`${conservados} corregidos a mano, sin tocar`] : []),
      ...(rechazados ? [`${rechazados} rechazados`] : []),
    ],
  }).catch(() => undefined);
  return { borrados: fin.borrados, base: fin.base, tiendasNuevas: [...tiendasNuevas], sinTipo, rechazados, conservados, porRegla, enMesCerrado: enMesCerrado + fin.enMesCerrado, sinTasa };
}

/** Lo que vino del archivo en la forma de `compararLibro`. */
const comoComparable = (m: MovimientoExcel): FilaComparable => ({
  clave: m.origen_clave,
  periodo: m.periodo,
  fecha_pago: m.fecha_pago,
  fecha_servicio: m.fecha_servicio,
  tienda: m.unidad,
  tipo: m.tipo,
  descripcion: m.descripcion,
  monto: m.monto,
  cuenta: m.cuenta,
  en_eerr: m.en_eerr,
  en_flujo: m.en_flujo,
  factura_numero: m.factura_numero,
  ruc_proveedor: m.ruc_proveedor,
});

/** Compara el Excel con lo ya cargado de ese mismo archivo (antes de aplicarlo). */
export async function compararConCargado(archivo: string, movimientos: MovimientoExcel[]): Promise<{ error: string } | Comparacion> {
  const r = await leerCargadoDelArchivo(archivo).catch(cortada);
  if ("error" in r) return r;
  return compararLibro(movimientos.map(comoComparable), r.filas);
}
