// La lista de «Llegadas a puerto» en la hoja de recepción de Logística (24 nov 2026, pedido de la encargada de recibir la mercancía): vertical, con el nombre del producto, las unidades y las cajas, y a la
// derecha las casillas para anotar al recibir (foto y muestra, llegó + / −, observaciones) y la firma de quien revisa. Dos versiones: sin fotos (32 filas por hoja, como el formato que ella hizo)
// y con la foto del producto (hojas con menos filas). Se arma en el navegador con pdf-lib. Lógica sin React, con prueba.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { partirEnLineas, textoPdf, type CargarFoto } from "../tabla/pdf";
import { textoProductos, type FilaLlegada } from "./llegadas-avisos";

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 30;
const UTIL = ANCHO - MARGEN * 2;

/** Filas de cada hoja: las 32 del formato sin fotos; con fotos caben menos porque cada fila lleva la foto. */
export const FILAS_SIN_FOTOS = 32;
export const FILAS_CON_FOTOS = 13;
const ALTO_FILA_SIN_FOTOS = 19.5;
const ALTO_FILA_CON_FOTOS = 48;
const FOTO = 40;
const A_LA_VEZ = 6;

const TAM = 7.5;
const LINEA = 8.5;
const TEXTO = rgb(0.09, 0.09, 0.11);
const GRIS = rgb(0.45, 0.45, 0.47);
const CABECERA = rgb(0.91, 0.91, 0.92);
const TOTAL = rgb(0.85, 0.85, 0.86);
const BORDE = rgb(0.62, 0.62, 0.64);

const entero = (n: number) => n.toLocaleString("es-PA");

/** Cuántas hojas ocupa una lista: siempre al menos una, y sin fotos una hoja completa aunque haya pocas filas (las que sobran quedan en blanco, numeradas). */
export function hojasDeLista(filas: number, conFotos: boolean): number {
  return Math.max(1, Math.ceil(filas / (conFotos ? FILAS_CON_FOTOS : FILAS_SIN_FOTOS)));
}

/** Los totales de unidades y cajas de las filas de una hoja. */
export function totalDeHoja(filas: readonly Pick<FilaLlegada, "unidades" | "cajas">[]): { unidades: number; cajas: number } {
  return filas.reduce<{ unidades: number; cajas: number }>((t, f) => ({ unidades: t.unidades + (f.unidades ?? 0), cajas: t.cajas + (f.cajas ?? 0) }), { unidades: 0, cajas: 0 });
}

const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Panama" });

/** Lo que dice «Fecha de llegada»: el día (dd/mm/aaaa, hora de Panamá) en que llegaron las compras de la lista, o «desde - hasta» si llegaron en días distintos; sin dato, queda para escribir a mano. */
export function fechaDeLlegada(filas: readonly Pick<FilaLlegada, "llegadaEn">[]): string {
  const dias = [...new Set(filas.flatMap((f) => (f.llegadaEn ? [f.llegadaEn] : [])).sort().map(diaPanama))];
  if (dias.length === 0) return "";
  return dias.length === 1 ? dias[0] : `${dias[0]} - ${dias[dias.length - 1]}`;
}

async function imagenes(doc: PDFDocument, urls: string[], cargar: CargarFoto): Promise<Map<string, PDFImage>> {
  const unicas = [...new Set(urls)];
  const out = new Map<string, PDFImage>();
  for (let i = 0; i < unicas.length; i += A_LA_VEZ) {
    await Promise.all(
      unicas.slice(i, i + A_LA_VEZ).map(async (url) => {
        try {
          const bytes = await cargar(url);
          if (bytes) out.set(url, await doc.embedJpg(bytes));
        } catch {
          // Sin esa foto.
        }
      }),
    );
  }
  return out;
}

export interface OpcionesListaPdf {
  /** Con la foto del producto en cada fila. */
  conFotos: boolean;
  /** Cómo traer las fotos (JPEG ya achicado); sin esto, la versión con fotos sale con el recuadro vacío. */
  cargar?: CargarFoto;
}

/** El PDF de la lista de llegadas a puerto pendientes de recibir, en la hoja de recepción. */
export async function listaLlegadasAPdf(filas: FilaLlegada[], { conFotos, cargar }: OpcionesListaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Llegadas a puerto");
  doc.setAuthor("Ecomfive");
  doc.setCreator("Ecomfive Business OS");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const fotos = conFotos && cargar ? await imagenes(doc, filas.flatMap((f) => (f.foto ? [f.foto] : [])), cargar) : new Map<string, PDFImage>();

  const porHoja = conFotos ? FILAS_CON_FOTOS : FILAS_SIN_FOTOS;
  const altoFila = conFotos ? ALTO_FILA_CON_FOTOS : ALTO_FILA_SIN_FOTOS;
  const hojas = hojasDeLista(filas.length, conFotos);
  const fechaLlegada = fechaDeLlegada(filas);

  // Columnas, de izquierda a derecha: # | producto | unidades | cajas | foto y muestra | llegó + / - | observaciones.
  const w = { num: 24, unidades: 52, cajas: 40, muestra: 62, llego: 56, obs: 112 };
  const wProducto = UTIL - (w.num + w.unidades + w.cajas + w.muestra + w.llego + w.obs);
  const x0 = MARGEN;
  const xProducto = x0 + w.num;
  const xUnidades = xProducto + wProducto;
  const xCajas = xUnidades + w.unidades;
  const xMuestra = xCajas + w.cajas;
  const xLlego = xMuestra + w.muestra;
  const xObs = xLlego + w.llego;
  const xFin = x0 + UTIL;
  const columnas = [x0, xProducto, xUnidades, xCajas, xMuestra, xLlego, xObs, xFin];

  const centrado = (pagina: PDFPage, texto: string, desde: number, hasta: number, y: number, f: PDFFont, tam: number) =>
    pagina.drawText(texto, { x: desde + (hasta - desde - f.widthOfTextAtSize(texto, tam)) / 2, y, size: tam, font: f, color: TEXTO });

  for (let h = 0; h < hojas; h++) {
    const pagina = doc.addPage([ANCHO, ALTO]);
    const delaHoja = filas.slice(h * porHoja, (h + 1) * porHoja);
    let y = ALTO - MARGEN;

    pagina.drawText("OCEANS ECOMMERCE", { x: MARGEN, y: y - 8, size: 8, font: fuente, color: GRIS });
    pagina.drawText("LLEGADAS A PUERTO", { x: MARGEN, y: y - 28, size: 17, font: negrita, color: TEXTO });
    pagina.drawText("Fecha de llegada:", { x: MARGEN, y: y - 46, size: 9, font: fuente, color: TEXTO });
    if (fechaLlegada) pagina.drawText(textoPdf(fechaLlegada), { x: MARGEN + 80, y: y - 46, size: 9, font: fuente, color: TEXTO });
    else pagina.drawLine({ start: { x: MARGEN + 80, y: y - 48 }, end: { x: MARGEN + 190, y: y - 48 }, thickness: 0.5, color: TEXTO });
    const hoja = `Hoja: ${h + 1} de ${hojas}`;
    pagina.drawText(hoja, { x: xFin - fuente.widthOfTextAtSize(hoja, 9), y: y - 46, size: 9, font: fuente, color: TEXTO });
    y -= 58;

    // Encabezado de la tabla.
    const altoCab = 24;
    pagina.drawRectangle({ x: x0, y: y - altoCab, width: UTIL, height: altoCab, color: CABECERA, borderColor: BORDE, borderWidth: 0.6 });
    const titulo = (t: string, desde: number, hasta: number) => centrado(pagina, t, desde, hasta, y - altoCab / 2 - 2.5, negrita, 7);
    titulo("#", x0, xProducto);
    titulo("PRODUCTO", xProducto, xUnidades);
    titulo("UNIDADES", xUnidades, xCajas);
    titulo("CAJAS", xCajas, xMuestra);
    titulo("FOTO Y MUESTRA", xMuestra, xLlego);
    titulo("LLEGO + / -", xLlego, xObs);
    titulo("OBSERVACIONES", xObs, xFin);
    y -= altoCab;

    const yTabla = y;
    for (let i = 0; i < porHoja; i++) {
      const f = delaHoja[i];
      const n = h * porHoja + i + 1;
      // Sin fotos, las filas que sobran de la hoja quedan en blanco y numeradas (para anotar a mano); con fotos solo se dibujan las que hay.
      if (!f && conFotos) break;
      const yFila = y - altoFila;
      pagina.drawRectangle({ x: x0, y: yFila, width: UTIL, height: altoFila, borderColor: BORDE, borderWidth: 0.4 });
      centrado(pagina, String(n), x0, xProducto, y - altoFila / 2 - 2.5, fuente, TAM);
      if (f) {
        if (conFotos) {
          const img = f.foto ? fotos.get(f.foto) : undefined;
          const yImg = y - (altoFila - FOTO) / 2 - FOTO;
          if (img) {
            const k = Math.min(FOTO / img.width, FOTO / img.height);
            pagina.drawImage(img, { x: xProducto + 4 + (FOTO - img.width * k) / 2, y: yImg + (FOTO - img.height * k) / 2, width: img.width * k, height: img.height * k });
          } else pagina.drawRectangle({ x: xProducto + 4, y: yImg, width: FOTO, height: FOTO, borderColor: BORDE, borderWidth: 0.5, borderDashArray: [2, 2] });
        }
        const xTexto = xProducto + 5 + (conFotos ? FOTO + 5 : 0);
        const lineas = partirEnLineas(textoPdf(textoProductos(f)), (s) => fuente.widthOfTextAtSize(s, TAM), xUnidades - xTexto - 4, conFotos ? 4 : 2);
        const alto = lineas.length * LINEA;
        lineas.forEach((l, j) => pagina.drawText(l, { x: xTexto, y: y - (altoFila - alto) / 2 - TAM - j * LINEA + 1, size: TAM, font: fuente, color: TEXTO }));
        centrado(pagina, f.unidades == null ? "-" : entero(f.unidades), xUnidades, xCajas, y - altoFila / 2 - 2.5, fuente, TAM + 0.5);
        centrado(pagina, f.cajas == null ? "-" : entero(f.cajas), xCajas, xMuestra, y - altoFila / 2 - 2.5, fuente, TAM + 0.5);
      }
      // La casilla para marcar la foto y la muestra.
      const lado = 9;
      pagina.drawRectangle({ x: xMuestra + (w.muestra - lado) / 2, y: y - altoFila / 2 - lado / 2, width: lado, height: lado, borderColor: TEXTO, borderWidth: 0.7 });
      y = yFila;
    }
    const yFinFilas = y;
    // Divisiones verticales de toda la tabla.
    for (const cx of columnas.slice(1, -1)) pagina.drawLine({ start: { x: cx, y: yTabla }, end: { x: cx, y: yFinFilas }, thickness: 0.4, color: BORDE });

    // Total de la hoja.
    const altoTotal = 20;
    pagina.drawRectangle({ x: x0, y: y - altoTotal, width: UTIL, height: altoTotal, color: TOTAL, borderColor: BORDE, borderWidth: 0.6 });
    const t = totalDeHoja(delaHoja);
    const yTot = y - altoTotal / 2 - 3;
    centrado(pagina, "TOTAL", x0, xUnidades, yTot, negrita, 8);
    centrado(pagina, entero(t.unidades), xUnidades, xCajas, yTot, negrita, 8);
    centrado(pagina, entero(t.cajas), xCajas, xMuestra, yTot, negrita, 8);
    y -= altoTotal;

    // Resumen de toda la lista, solo si ocupa más de una hoja.
    if (hojas > 1 && h === hojas - 1) {
      const g = totalDeHoja(filas);
      pagina.drawText(textoPdf(`Total de las ${hojas} hojas: ${entero(filas.length)} compras - ${entero(g.unidades)} unidades - ${entero(g.cajas)} cajas`), { x: MARGEN, y: y - 14, size: 8, font: negrita, color: TEXTO });
    }

    // Pie: quién revisó.
    const yPie = MARGEN + 6;
    pagina.drawText("Revisado por:", { x: MARGEN, y: yPie, size: 8.5, font: fuente, color: TEXTO });
    pagina.drawLine({ start: { x: MARGEN + 58, y: yPie - 2 }, end: { x: MARGEN + 300, y: yPie - 2 }, thickness: 0.5, color: TEXTO });
    pagina.drawText("(Nombre legible y firma)", { x: MARGEN + 58, y: yPie - 11, size: 6.5, font: fuente, color: GRIS });
    pagina.drawText("Fecha:", { x: MARGEN + 330, y: yPie, size: 8.5, font: fuente, color: TEXTO });
    pagina.drawLine({ start: { x: MARGEN + 358, y: yPie - 2 }, end: { x: xFin, y: yPie - 2 }, thickness: 0.5, color: TEXTO });
  }
  return doc.save();
}

/**
 * «lista-llegadas-puerto-2026-11-24.pdf» / «lista-llegadas-puerto-con-fotos-2026-11-24.pdf». De un lote (`desdeLote`, el instante de su primera llegada), lleva también la hora de Panamá:
 * «lista-llegadas-puerto-2026-11-24-0714.pdf», para no confundir dos lotes del mismo día.
 */
export function nombreArchivoLista(fecha: Date, conFotos: boolean, desdeLote?: string): string {
  const base = `lista-llegadas-puerto${conFotos ? "-con-fotos" : ""}`;
  if (desdeLote && !Number.isNaN(Date.parse(desdeLote))) {
    const [dia, hora] = new Date(desdeLote).toLocaleString("sv-SE", { timeZone: "America/Panama", hour12: false }).split(" ");
    return `${base}-${dia}-${hora.slice(0, 5).replace(":", "")}.pdf`;
  }
  return `${base}-${fecha.toISOString().slice(0, 10)}.pdf`;
}
