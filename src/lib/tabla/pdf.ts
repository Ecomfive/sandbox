// PDF de lo que se ve en una tabla (8 nov 2026, pedido de Alcides: «descargar el filtro en PDF para enviarlo a alguien»). Las mismas filas y en el mismo
// orden que el CSV de «Descargar», con las columnas de `def.pdf` (o las primeras con datos), en una hoja horizontal con su título, la fecha y el número de
// página. Se arma en el navegador con pdf-lib, sin pedirle nada al servidor. Lógica sin React, con prueba.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { columnasDeDescarga, type CeldaCsv, type ColumnaDescarga } from "./csv";
import type { DefTabla } from "./motor";

const ANCHO = 841.89;
const ALTO = 595.28;
const MARGEN = 32;
const UTIL = ANCHO - MARGEN * 2;
const TAM = 7.5;
const LINEA = 9.5;
const MAX_LINEAS = 3;
const PADDING = 4;
const MAX_COLUMNAS = 9;
/** La foto de cada fila (8 nov 2026, pedido de Alcides), si la tabla la da con `def.pdfFoto`: un cuadrado de este lado, en la primera columna. */
const FOTO = 36;
const ANCHO_FOTO = FOTO + PADDING * 2;
/** Fotos que se piden a la vez. */
const A_LA_VEZ = 6;

const TEXTO = rgb(0.09, 0.09, 0.11);
const GRIS = rgb(0.42, 0.42, 0.44);
const CABECERA = rgb(0.93, 0.93, 0.94);
const CEBRA = rgb(0.975, 0.975, 0.98);
const BORDE = rgb(0.86, 0.86, 0.87);

/** Las fuentes estándar del PDF solo dibujan Latin-1: lo demás se cambia por algo parecido. */
export function textoPdf(texto: string): string {
  return texto
    .replace(/[  -​ ]/g, " ")
    .replace(/₡/g, "CRC ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/›/g, ">")
    .replace(/‹/g, "<")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e\xa1-\xff]/g, "");
}

/** Cómo se lee una celda en el PDF: números con separador de miles, fechas como día/mes/año. */
export function celdaPdf(valor: CeldaCsv, tipo: ColumnaDescarga<unknown>["tipo"]): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? valor.toLocaleString("es-PA", { maximumFractionDigits: 2 }) : "";
  const fecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (tipo === "fecha" && fecha) return `${fecha[3]}/${fecha[2]}/${fecha[1]}`;
  return valor;
}

/** Las columnas del PDF: las que nombra `def.pdf`, en ese orden; si no, las primeras del CSV que traen algo en alguna fila (hasta 9). */
export function columnasPdf<F>(def: DefTabla<F>, filas: F[]): ColumnaDescarga<F>[] {
  const todas = columnasDeDescarga(def, filas);
  if (def.pdf?.length) return def.pdf.flatMap((nombre) => todas.find((c) => c.etiqueta === nombre) ?? []);
  return todas.filter((c) => filas.some((f) => celdaPdf(c.valor(f), c.tipo) !== "")).slice(0, MAX_COLUMNAS);
}

/** Parte un texto en líneas que caben en `ancho`; si no caben en `max` líneas, la última termina en «...». */
export function partirEnLineas(texto: string, medir: (t: string) => number, ancho: number, max = MAX_LINEAS): string[] {
  const lineas: string[] = [];
  let actual = "";
  const palabras = texto.split(/\s+/).filter(Boolean);
  for (let i = 0; i < palabras.length; i++) {
    let palabra = palabras[i];
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    // Una palabra más larga que la columna se corta.
    while (medir(palabra) > ancho && palabra.length > 1) {
      let corte = palabra.length - 1;
      while (corte > 1 && medir(palabra.slice(0, corte)) > ancho) corte--;
      // Un SKU («ESPUMA/DEPILACION/…») se corta después de una «/» si la hay, no a mitad de palabra.
      const barra = palabra.lastIndexOf("/", corte - 1);
      if (barra > 0) corte = barra + 1;
      lineas.push(palabra.slice(0, corte));
      palabra = palabra.slice(corte);
    }
    actual = palabra;
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= max) return lineas;
  const cortadas = lineas.slice(0, max);
  let ultima = cortadas[max - 1];
  while (ultima.length > 1 && medir(`${ultima}...`) > ancho) ultima = ultima.slice(0, -1);
  cortadas[max - 1] = `${ultima.trimEnd()}...`;
  return cortadas;
}

/** El ancho de cada columna: lo que ocupa su texto más largo (entre un mínimo y un máximo), repartido para llenar la hoja. */
function anchos(textos: string[][], encabezados: string[], fuente: PDFFont, negrita: PDFFont, util = UTIL): number[] {
  const natural = encabezados.map((h, i) => {
    const largo = Math.max(negrita.widthOfTextAtSize(h, TAM), ...textos.map((fila) => fuente.widthOfTextAtSize(fila[i], TAM)));
    return Math.min(Math.max(largo + PADDING * 2, 42), 230);
  });
  const total = natural.reduce((a, b) => a + b, 0);
  return natural.map((w) => (w / total) * util);
}

/** Una foto lista para el PDF: los bytes de un JPEG (lo achica quien la trae, en el navegador). null si no se pudo traer. */
export type CargarFoto = (url: string) => Promise<Uint8Array | null>;

/** Las fotos de las filas, cada dirección una vez y de a `A_LA_VEZ`. Una que falla queda sin foto. */
async function fotosDeFilas(doc: PDFDocument, urls: (string | null)[], cargar: CargarFoto): Promise<Map<string, PDFImage>> {
  const unicas = [...new Set(urls.filter((u): u is string => !!u))];
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

/** El PDF de las filas que se ven, con `titulo` arriba (el de la página). Con `def.pdfFoto` y `cargarFoto`, la primera columna es la foto de cada fila. */
export async function filasAPdf<F>(def: DefTabla<F>, filas: F[], titulo: string, fecha = new Date(), cargarFoto?: CargarFoto): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoPdf(titulo));
  doc.setAuthor("Ecomfive");
  doc.setCreator("Ecomfive Business OS");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  const columnas = columnasPdf(def, filas);
  const encabezados = columnas.map((c) => textoPdf(c.etiqueta));
  const textos = filas.map((f) => columnas.map((c) => textoPdf(celdaPdf(c.valor(f), c.tipo))));
  const urlsFoto = def.pdfFoto && cargarFoto ? filas.map((f) => def.pdfFoto!(f)) : null;
  const fotos = urlsFoto ? await fotosDeFilas(doc, urlsFoto, cargarFoto!) : new Map<string, PDFImage>();
  const conFoto = !!urlsFoto;
  const izquierda = conFoto ? ANCHO_FOTO : 0;
  const w = anchos(textos, encabezados, fuente, negrita, UTIL - izquierda);
  const derecha = columnas.map((c) => c.tipo === "numero");
  const cuando = fecha.toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
  const subtitulo = textoPdf(`${filas.length.toLocaleString("es-PA")} ${filas.length === 1 ? "fila" : "filas"} · descargado el ${cuando}`);

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const filaDeTexto = (celdas: string[], fuenteFila: PDFFont, fondo: ReturnType<typeof rgb> | null, foto?: PDFImage | null) => {
    const lineas = celdas.map((t, i) => partirEnLineas(t, (x) => fuenteFila.widthOfTextAtSize(x, TAM), w[i] - PADDING * 2));
    const texto = Math.max(1, ...lineas.map((l) => l.length)) * LINEA + PADDING * 2 - 2;
    // Con fotos, toda fila de datos (con foto o sin ella) tiene el alto de la foto: así las filas se ven parejas.
    const alto = conFoto && foto !== undefined ? Math.max(texto, FOTO + PADDING * 2) : texto;
    return { lineas, alto, fondo, fuenteFila, foto };
  };
  const dibujar = (f: ReturnType<typeof filaDeTexto>) => {
    if (f.fondo) pagina.drawRectangle({ x: MARGEN, y: y - f.alto, width: UTIL, height: f.alto, color: f.fondo });
    if (conFoto && f.foto !== undefined) {
      const caja = { x: MARGEN + PADDING, y: y - PADDING - FOTO, lado: FOTO };
      if (f.foto) {
        // La foto entera, sin estirar, centrada en su cuadrado.
        const k = Math.min(caja.lado / f.foto.width, caja.lado / f.foto.height);
        const fw = f.foto.width * k;
        const fh = f.foto.height * k;
        pagina.drawImage(f.foto, { x: caja.x + (caja.lado - fw) / 2, y: caja.y + (caja.lado - fh) / 2, width: fw, height: fh });
      } else {
        pagina.drawRectangle({ x: caja.x, y: caja.y, width: caja.lado, height: caja.lado, borderColor: BORDE, borderWidth: 0.6, borderDashArray: [2, 2] });
      }
    }
    let x = MARGEN + izquierda;
    f.lineas.forEach((ls, i) => {
      ls.forEach((linea, j) => {
        const ancho = f.fuenteFila.widthOfTextAtSize(linea, TAM);
        const tx = derecha[i] && f.fuenteFila === fuente ? x + w[i] - PADDING - ancho : x + PADDING;
        pagina.drawText(linea, { x: tx, y: y - PADDING - TAM - j * LINEA + 1, size: TAM, font: f.fuenteFila, color: TEXTO });
      });
      x += w[i];
    });
    y -= f.alto;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + UTIL, y }, thickness: 0.4, color: BORDE });
  };
  const cabecera = filaDeTexto(encabezados, negrita, CABECERA);
  // «Foto» en la cabecera, sobre la columna de las fotos.
  const dibujarCabecera = () => {
    const arriba = y;
    dibujar(cabecera);
    if (conFoto) pagina.drawText("Foto", { x: MARGEN + PADDING, y: arriba - PADDING - TAM + 1, size: TAM, font: negrita, color: TEXTO });
  };
  const nuevaPagina = () => {
    pagina = doc.addPage([ANCHO, ALTO]);
    paginas.push(pagina);
    y = ALTO - MARGEN;
    if (paginas.length === 1) {
      pagina.drawText(textoPdf(titulo), { x: MARGEN, y: y - 14, size: 14, font: negrita, color: TEXTO });
      pagina.drawText(subtitulo, { x: MARGEN, y: y - 28, size: 8.5, font: fuente, color: GRIS });
      y -= 40;
    }
    dibujarCabecera();
  };

  nuevaPagina();
  if (!columnas.length || !filas.length) {
    pagina.drawText("No hay filas para mostrar.", { x: MARGEN, y: y - 16, size: 9, font: fuente, color: GRIS });
  }
  textos.forEach((celdas, n) => {
    const url = urlsFoto?.[n] ?? null;
    const f = filaDeTexto(celdas, fuente, n % 2 ? CEBRA : null, conFoto ? (url ? (fotos.get(url) ?? null) : null) : undefined);
    if (y - f.alto < MARGEN + 18) nuevaPagina();
    dibujar(f);
  });

  paginas.forEach((p, i) => {
    p.drawText("Ecomfive", { x: MARGEN, y: MARGEN - 12, size: 7.5, font: fuente, color: GRIS });
    const texto = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(textoPdf(texto), { x: ANCHO - MARGEN - fuente.widthOfTextAtSize(textoPdf(texto), 7.5), y: MARGEN - 12, size: 7.5, font: fuente, color: GRIS });
  });
  return doc.save();
}

/** «producto-2026-11-08.pdf»: la clave de la tabla y el día. */
export function nombreArchivoPdf(clave: string, fecha: Date): string {
  return `${clave}-${fecha.toISOString().slice(0, 10)}.pdf`;
}

