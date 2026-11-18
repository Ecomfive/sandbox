// PDF de lo que llegó a puerto (18 nov 2026, pedido de Logística: «que le permita descargar esa información en PDF»). La misma lista de la pantalla, para imprimirla o mandarla:
// foto del producto, producto, unidades, cajas y la etiqueta de las cajas, con los totales arriba. Se arma en el navegador con pdf-lib. Lógica sin React, con prueba.

import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { partirEnLineas, textoPdf, type CargarFoto } from "../tabla/pdf";
import { textoProductos, totalesDeLlegada, type FilaLlegada } from "./llegadas-avisos";

const ANCHO = 841.89;
const ALTO = 595.28;
const MARGEN = 32;
const UTIL = ANCHO - MARGEN * 2;
const TAM = 8;
const LINEA = 10;
const PADDING = 5;
/** Lado de la foto del producto y de cada imagen de etiqueta en la hoja. */
const FOTO = 54;
const ETIQUETA = 54;
/** Imágenes de etiqueta por compra que caben en la fila (las demás se cuentan). */
const MAX_ETIQUETAS = 3;
const A_LA_VEZ = 6;

const TEXTO = rgb(0.09, 0.09, 0.11);
const GRIS = rgb(0.42, 0.42, 0.44);
const CABECERA = rgb(0.93, 0.93, 0.94);
const BORDE = rgb(0.86, 0.86, 0.87);

const entero = (n: number) => n.toLocaleString("es-PA");

/** Una imagen que se pone en el PDF: su dirección (la foto del producto o una etiqueta). */
export interface EtiquetaParaPdf {
  url: string;
}

/** Las imágenes de cada dirección, una vez y de a `A_LA_VEZ`. Una que no se puede traer queda sin imagen. */
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
          // Sin esa imagen.
        }
      }),
    );
  }
  return out;
}

/** El PDF de las llegadas a puerto de un periodo. `etiquetas` trae, por compra, las direcciones de su etiqueta; sin `cargar`, el PDF sale sin imágenes. */
export async function llegadasAPdf(
  filas: FilaLlegada[],
  etiquetas: Record<string, EtiquetaParaPdf[]>,
  periodo: string,
  fecha = new Date(),
  cargar?: CargarFoto,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Llegadas a puerto");
  doc.setAuthor("Ecomfive");
  doc.setCreator("Ecomfive Business OS");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  const urls = cargar ? filas.flatMap((f) => [...(f.foto ? [f.foto] : []), ...(etiquetas[f.compraId] ?? []).slice(0, MAX_ETIQUETAS).map((e) => e.url)]) : [];
  const fotos = cargar ? await imagenes(doc, urls, cargar) : new Map<string, PDFImage>();

  const t = totalesDeLlegada(filas);
  const cuando = fecha.toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
  const resumen = textoPdf(`${periodo} · ${entero(t.compras)} ${t.compras === 1 ? "compra" : "compras"} · ${entero(t.unidades)} unidades · ${entero(t.cajas)} cajas${t.sinCajas ? ` (${entero(t.sinCajas)} sin anotar)` : ""}`);
  const subtitulo = textoPdf(`Descargado el ${cuando}`);

  // Columnas: foto | producto y orden | unidades | cajas | etiqueta.
  const xFoto = MARGEN + PADDING;
  const xProducto = MARGEN + FOTO + PADDING * 2;
  const wUnidades = 62;
  const wCajas = 50;
  const wEtiqueta = MAX_ETIQUETAS * (ETIQUETA + 4) + PADDING;
  const xEtiqueta = MARGEN + UTIL - wEtiqueta;
  const xCajas = xEtiqueta - wCajas;
  const xUnidades = xCajas - wUnidades;
  const wProducto = xUnidades - xProducto - PADDING;

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const cabecera = () => {
    pagina.drawRectangle({ x: MARGEN, y: y - 16, width: UTIL, height: 16, color: CABECERA });
    const texto = (s: string, x: number) => pagina.drawText(s, { x, y: y - 11.5, size: TAM, font: negrita, color: TEXTO });
    texto("Foto", xFoto);
    texto("Producto", xProducto);
    texto("Unidades", xUnidades + wUnidades - PADDING - negrita.widthOfTextAtSize("Unidades", TAM));
    pagina.drawText("Cajas", { x: xCajas + wCajas - PADDING - negrita.widthOfTextAtSize("Cajas", TAM), y: y - 11.5, size: TAM, font: negrita, color: TEXTO });
    pagina.drawText("Etiqueta de las cajas", { x: xEtiqueta + PADDING, y: y - 11.5, size: TAM, font: negrita, color: TEXTO });
    y -= 16;
  };
  const nuevaPagina = () => {
    pagina = doc.addPage([ANCHO, ALTO]);
    paginas.push(pagina);
    y = ALTO - MARGEN;
    if (paginas.length === 1) {
      pagina.drawText("Llegadas a puerto", { x: MARGEN, y: y - 14, size: 14, font: negrita, color: TEXTO });
      pagina.drawText(resumen, { x: MARGEN, y: y - 28, size: 9, font: fuente, color: TEXTO });
      pagina.drawText(subtitulo, { x: MARGEN, y: y - 40, size: 8, font: fuente, color: GRIS });
      y -= 52;
    }
    cabecera();
  };

  /** La imagen entera, sin estirar, centrada en su cuadrado; sin imagen, un cuadrado punteado. */
  const poner = (img: PDFImage | undefined, x: number, lado: number) => {
    const yCaja = y - PADDING - lado;
    if (!img) {
      pagina.drawRectangle({ x, y: yCaja, width: lado, height: lado, borderColor: BORDE, borderWidth: 0.6, borderDashArray: [2, 2] });
      return;
    }
    const k = Math.min(lado / img.width, lado / img.height);
    const w = img.width * k;
    const h = img.height * k;
    pagina.drawImage(img, { x: x + (lado - w) / 2, y: yCaja + (lado - h) / 2, width: w, height: h });
  };

  nuevaPagina();
  if (filas.length === 0) pagina.drawText("No hay llegadas en este periodo.", { x: MARGEN, y: y - 16, size: 9, font: fuente, color: GRIS });
  for (const f of filas) {
    const producto = partirEnLineas(textoPdf(textoProductos(f)), (s) => negrita.widthOfTextAtSize(s, TAM), wProducto, 3);
    const detalle = partirEnLineas(textoPdf(`${f.orden}${f.codigo ? ` · ${f.codigo}` : ""}`), (s) => fuente.widthOfTextAtSize(s, TAM - 0.5), wProducto, 1);
    const alto = Math.max(FOTO, ETIQUETA) + PADDING * 2;
    if (y - alto < MARGEN + 18) nuevaPagina();

    poner(f.foto ? fotos.get(f.foto) : undefined, xFoto, FOTO);
    producto.forEach((l, i) => pagina.drawText(l, { x: xProducto, y: y - PADDING - TAM - i * LINEA + 1, size: TAM, font: negrita, color: TEXTO }));
    detalle.forEach((l, i) => pagina.drawText(l, { x: xProducto, y: y - PADDING - TAM - (producto.length + i) * LINEA - 1, size: TAM - 0.5, font: fuente, color: GRIS }));

    const unidades = f.unidades == null ? "-" : entero(f.unidades);
    pagina.drawText(unidades, { x: xUnidades + wUnidades - PADDING - fuente.widthOfTextAtSize(unidades, TAM), y: y - PADDING - TAM + 1, size: TAM, font: fuente, color: TEXTO });
    const cajas = f.cajas == null ? "Sin anotar" : entero(f.cajas);
    pagina.drawText(cajas, { x: xCajas + wCajas - PADDING - fuente.widthOfTextAtSize(cajas, TAM), y: y - PADDING - TAM + 1, size: TAM, font: fuente, color: f.cajas == null ? GRIS : TEXTO });

    const dirs = (etiquetas[f.compraId] ?? []).slice(0, MAX_ETIQUETAS);
    if (dirs.length === 0) {
      pagina.drawText(f.etiquetasRutas.length > 0 ? "No se pudo cargar" : "Sin etiqueta", { x: xEtiqueta + PADDING, y: y - PADDING - TAM + 1, size: TAM - 0.5, font: fuente, color: GRIS });
    } else {
      dirs.forEach((e, i) => poner(fotos.get(e.url), xEtiqueta + PADDING + i * (ETIQUETA + 4), ETIQUETA));
      const mas = (etiquetas[f.compraId] ?? []).length - dirs.length;
      if (mas > 0) pagina.drawText(`+${mas} mas`, { x: xEtiqueta + PADDING, y: y - alto + 3, size: TAM - 1, font: fuente, color: GRIS });
    }

    y -= alto;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + UTIL, y }, thickness: 0.4, color: BORDE });
  }

  paginas.forEach((p, i) => {
    p.drawText("Ecomfive", { x: MARGEN, y: MARGEN - 12, size: 7.5, font: fuente, color: GRIS });
    const texto = textoPdf(`Página ${i + 1} de ${paginas.length}`);
    p.drawText(texto, { x: ANCHO - MARGEN - fuente.widthOfTextAtSize(texto, 7.5), y: MARGEN - 12, size: 7.5, font: fuente, color: GRIS });
  });
  return doc.save();
}

/** «llegadas-puerto-2026-11-18.pdf». */
export function nombreArchivoLlegadas(fecha: Date): string {
  return `llegadas-puerto-${fecha.toISOString().slice(0, 10)}.pdf`;
}
