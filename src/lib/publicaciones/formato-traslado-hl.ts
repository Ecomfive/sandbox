// El «Manifiesto de entrega de mercancía · HL Express Panamá» para pedir un traslado de inventario (18 nov 2026, pedido de Hernán y Nicol): al republicar un ID de la
// bodega de Dropi (B280), Dropi/HL Express tiene que trasladar el stock del ID viejo al nuevo. Antes el sistema dejaba un mensaje para copiar; HL Express pide un documento
// formal, así que ahora arma su mismo Excel con los datos del traslado y quien lo pide lo descarga y se lo manda. Aquí, la lógica pura (las líneas del manifiesto) y el armado
// del Excel sobre la plantilla real (`formato-traslado-hl-plantilla.ts`), con prueba.

import ExcelJS from "exceljs";
import { PLANTILLA_HL_BASE64 } from "./formato-traslado-hl-plantilla";

/** Filas de producto que caben en la plantilla (de la 12 a la 26). */
export const FILAS_DEL_FORMATO = 15;
const PRIMERA_FILA = 12;
/** El precio unitario de la hoja de ejemplo del equipo: un traslado no tiene precio, y el manifiesto lo pide para calcular su total. */
export const PRECIO_UNITARIO = 1;

export interface LineaFormato {
  /** «8946 → 12034»: de qué ID sale y a cuál entra. */
  idItem: string;
  descripcion: string;
  /** El color o la talla de la variación; «Estándar» si el producto no tiene. */
  presentacion: string;
  unidades: number;
}

export interface DatosFormato {
  viejo: number | string;
  nuevo: number | string;
  /** El nombre del producto en Dropi. */
  nombre: string;
  /** Lo que tiene el ID viejo en la bodega de Dropi cuando no hay desglose por variación. */
  unidades: number | null;
  /** Las unidades de cada variación en la bodega de Dropi; vacío si el producto no tiene variaciones. */
  variaciones: { etiqueta: string; unidades: number }[];
  /** Nombre de la bodega de Dropi de la que salen, para «Origen». */
  origen: string;
  /** AAAA-MM-DD; sin fecha queda en blanco. */
  fecha: string | null;
  /** Número de la publicación («PUB-0441») para la referencia, si se conoce. */
  publicacion?: string | null;
}

const limpio = (t: string, max: number) => t.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Las líneas del manifiesto: una por variación con unidades o, sin variaciones, una sola con el total. Lo que no cabe en las 15 filas se junta en la última
 * («Otras N variaciones») para que el total siga cuadrando.
 */
export function lineasDelFormato(d: Pick<DatosFormato, "viejo" | "nuevo" | "nombre" | "unidades" | "variaciones">): LineaFormato[] {
  const idItem = `${d.viejo} → ${d.nuevo}`;
  const descripcion = limpio(d.nombre, 80) || `ID ${d.viejo}`;
  const conStock = d.variaciones.filter((v) => v.unidades > 0).map((v) => ({ etiqueta: limpio(v.etiqueta, 60) || "Sin nombre", unidades: Math.round(v.unidades) }));
  if (!conStock.length) return [{ idItem, descripcion, presentacion: "Estándar", unidades: Math.max(0, Math.round(d.unidades ?? 0)) }];
  const lineas = conStock.map((v) => ({ idItem, descripcion, presentacion: v.etiqueta, unidades: v.unidades }));
  if (lineas.length <= FILAS_DEL_FORMATO) return lineas;
  const resto = lineas.slice(FILAS_DEL_FORMATO - 1);
  return [...lineas.slice(0, FILAS_DEL_FORMATO - 1), { idItem, descripcion, presentacion: `Otras ${resto.length} variaciones`, unidades: resto.reduce((t, l) => t + l.unidades, 0) }];
}

/** «18/11/2026» de «2026-11-18»; null si no es una fecha. */
export function fechaDelFormato(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** El nombre del archivo que se descarga: «Traslado HL Express ID 8946 a 12034.xlsx». */
export const nombreArchivoFormato = (viejo: number | string, nuevo: number | string) => `Traslado HL Express ID ${viejo} a ${nuevo}.xlsx`;

/**
 * El Excel de HL Express con los datos del traslado. Se llenan la fecha, el cliente, la referencia, el origen y quién recibe, y el detalle; el número de remisión, el contacto y
 * su teléfono quedan en blanco para quien lo manda. Las fórmulas de totales de la hoja se conservan y se recalculan al abrir.
 */
export async function armarFormatoTrasladoHL(d: DatosFormato): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PLANTILLA_HL_BASE64, "base64") as unknown as ExcelJS.Buffer);
  const hoja = wb.worksheets[0];
  const texto = (celda: string, valor: string | null) => {
    hoja.getCell(celda).value = valor ?? null;
  };

  texto("B5", null);
  texto("E5", fechaDelFormato(d.fecha));
  texto("B6", "ECOMFIVE");
  texto("E6", `Traslado del ID ${d.viejo} al ID ${d.nuevo}${d.publicacion ? ` · ${d.publicacion}` : ""}`);
  texto("B7", null);
  texto("E7", null);
  texto("B8", limpio(d.origen, 60));
  texto("E8", "HL Express Panamá");

  const lineas = lineasDelFormato(d);
  for (let i = 0; i < FILAS_DEL_FORMATO; i++) {
    const fila = PRIMERA_FILA + i;
    const l = lineas[i];
    if (!l) {
      for (const col of ["A", "B", "C", "D", "E", "F"]) hoja.getCell(`${col}${fila}`).value = null;
      continue;
    }
    hoja.getCell(`A${fila}`).value = l.idItem;
    hoja.getCell(`B${fila}`).value = l.descripcion;
    hoja.getCell(`C${fila}`).value = l.presentacion;
    hoja.getCell(`D${fila}`).value = l.unidades;
    hoja.getCell(`E${fila}`).value = PRECIO_UNITARIO;
    hoja.getCell(`F${fila}`).value = { formula: `D${fila}*E${fila}`, result: l.unidades * PRECIO_UNITARIO };
  }
  const total = lineas.reduce((t, l) => t + l.unidades, 0);
  hoja.getCell("D27").value = { formula: `SUM(D${PRIMERA_FILA}:D${PRIMERA_FILA + FILAS_DEL_FORMATO - 1})`, result: total };
  hoja.getCell("F27").value = { formula: `SUM(F${PRIMERA_FILA}:F${PRIMERA_FILA + FILAS_DEL_FORMATO - 1})`, result: total * PRECIO_UNITARIO };

  wb.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
