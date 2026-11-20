// El PDF de un pedido a inventario (20 nov 2026, pedido de Jhokser: «en Comunicación despacho, un botón para descargar el pedido en PDF»): una hoja vertical
// con el N.º, su estado y fechas, quién lo pidió y, en una tabla, cada producto con lo pedido, lo entregado y las observaciones. Se arma en el navegador con
// pdf-lib (como el PDF de las tablas), sin pedirle nada al servidor. Lógica sin React, con prueba.

import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { partirEnLineas, textoPdf } from "@/lib/tabla/pdf";
import { estadoDe, fechaCorta, numeroPedido, type PedidoInventario } from "./reglas";

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 40;
const UTIL = ANCHO - MARGEN * 2;
const TAM = 9;
const LINEA = 11.5;
const PADDING = 5;
const MAX_LINEAS = 4;

const TEXTO = rgb(0.09, 0.09, 0.11);
const GRIS = rgb(0.42, 0.42, 0.44);
const CABECERA = rgb(0.93, 0.93, 0.94);
const CEBRA = rgb(0.975, 0.975, 0.98);
const BORDE = rgb(0.86, 0.86, 0.87);

/** Lo que se lee en cada columna de la tabla: la posición de la «x» y el ancho (la de producto toma lo que sobra). */
const COLUMNAS = [
  { titulo: "Código", ancho: 112, derecha: false },
  { titulo: "Producto", ancho: 0, derecha: false },
  { titulo: "Pedida", ancho: 48, derecha: true },
  { titulo: "Entregada", ancho: 58, derecha: true },
  { titulo: "Observaciones", ancho: 120, derecha: false },
] as const;

const num = (n: number) => n.toLocaleString("es-PA");

/** Las observaciones de cada línea (la nota de quien pidió, la de inventario y, en la última, el traslado), como en la tabla de la pantalla. */
export function observacionesDeLineas(p: PedidoInventario): string[] {
  return p.items.map((it, i) => [it.nota, it.observacion, i === p.items.length - 1 ? p.traslado : null].filter(Boolean).join(" · "));
}

/** Los datos de la cabecera que tienen valor, en el orden en que se leen. */
export function datosDelPedido(p: PedidoInventario): [string, string][] {
  const datos: [string, string | null][] = [
    ["Estado", estadoDe(p.estado).etiqueta],
    ["Fecha del pedido", fechaCorta(p.creadoEn)],
    ["Pedido por", p.pedidoPorNombre],
    ["Responsable de bodega", p.responsableNombre],
    ["Enviado", p.enviadoEn ? fechaCorta(p.enviadoEn) : null],
    ["Entregado", p.recibidoEn ? `${fechaCorta(p.recibidoEn)}${p.recibidoPorNombre ? ` · ${p.recibidoPorNombre}` : ""}` : null],
  ];
  return datos.filter((d): d is [string, string] => !!d[1]);
}

/** «PED-0012.pdf». */
export const nombreArchivoPedido = (p: Pick<PedidoInventario, "numero">) => `${numeroPedido(p.numero)}.pdf`;

export async function pedidoAPdf(p: PedidoInventario, fecha = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoPdf(`Pedido ${numeroPedido(p.numero)}`));
  doc.setAuthor("Ecomfive");
  doc.setCreator("Ecomfive Business OS");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  const w: number[] = COLUMNAS.map((c) => c.ancho);
  w[1] = UTIL - w.reduce((a, b) => a + b, 0);
  const obs = observacionesDeLineas(p);
  const filas = p.items.map((it, i) => [it.codigo ?? "", it.producto, num(it.cantidadPedida), it.cantidadEntregada === null ? "-" : num(it.cantidadEntregada), obs[i]].map(textoPdf));
  const totalPedida = p.items.reduce((s, it) => s + it.cantidadPedida, 0);
  const totalEntregada = p.items.some((it) => it.cantidadEntregada !== null) ? p.items.reduce((s, it) => s + (it.cantidadEntregada ?? 0), 0) : null;

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const fila = (celdas: string[], f: typeof fuente, fondo: ReturnType<typeof rgb> | null) => {
    const lineas = celdas.map((t, i) => partirEnLineas(t, (x) => f.widthOfTextAtSize(x, TAM), w[i] - PADDING * 2, MAX_LINEAS));
    const alto = Math.max(1, ...lineas.map((l) => l.length)) * LINEA + PADDING * 2 - 2;
    return { lineas, alto, f, fondo };
  };
  const dibujar = (r: ReturnType<typeof fila>) => {
    if (r.fondo) pagina.drawRectangle({ x: MARGEN, y: y - r.alto, width: UTIL, height: r.alto, color: r.fondo });
    let x = MARGEN;
    r.lineas.forEach((ls, i) => {
      ls.forEach((linea, j) => {
        const ancho = r.f.widthOfTextAtSize(linea, TAM);
        const tx = COLUMNAS[i].derecha ? x + w[i] - PADDING - ancho : x + PADDING;
        pagina.drawText(linea, { x: tx, y: y - PADDING - TAM - j * LINEA + 1, size: TAM, font: r.f, color: TEXTO });
      });
      x += w[i];
    });
    y -= r.alto;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: MARGEN + UTIL, y }, thickness: 0.4, color: BORDE });
  };
  const cabecera = fila(COLUMNAS.map((c) => c.titulo), negrita, CABECERA);
  const nuevaPagina = () => {
    pagina = doc.addPage([ANCHO, ALTO]);
    paginas.push(pagina);
    y = ALTO - MARGEN;
    if (paginas.length === 1) {
      pagina.drawText(textoPdf(`Pedido a inventario ${numeroPedido(p.numero)}`), { x: MARGEN, y: y - 16, size: 16, font: negrita, color: TEXTO });
      const cuando = fecha.toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
      pagina.drawText(textoPdf(`Descargado el ${cuando}`), { x: MARGEN, y: y - 30, size: 8.5, font: fuente, color: GRIS });
      y -= 48;
      for (const [etiqueta, valor] of datosDelPedido(p)) {
        pagina.drawText(textoPdf(etiqueta), { x: MARGEN, y: y - 10, size: TAM, font: fuente, color: GRIS });
        pagina.drawText(textoPdf(valor), { x: MARGEN + 118, y: y - 10, size: TAM, font: negrita, color: TEXTO });
        y -= LINEA + 3;
      }
      y -= 12;
    }
    dibujar(cabecera);
  };

  nuevaPagina();
  filas.forEach((celdas, n) => {
    const r = fila(celdas, fuente, n % 2 ? CEBRA : null);
    if (y - r.alto < MARGEN + 40) nuevaPagina();
    dibujar(r);
  });
  const total = fila(["", "Total", num(totalPedida), totalEntregada === null ? "" : num(totalEntregada), ""], negrita, null);
  if (y - total.alto < MARGEN + 24) nuevaPagina();
  dibujar(total);

  paginas.forEach((pg, i) => {
    pg.drawText("Ecomfive", { x: MARGEN, y: MARGEN - 14, size: 7.5, font: fuente, color: GRIS });
    const texto = textoPdf(`Página ${i + 1} de ${paginas.length}`);
    pg.drawText(texto, { x: ANCHO - MARGEN - fuente.widthOfTextAtSize(texto, 7.5), y: MARGEN - 14, size: 7.5, font: fuente, color: GRIS });
  });
  return doc.save();
}
