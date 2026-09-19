import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { LOGO_ECOMFIVE_ALTO, LOGO_ECOMFIVE_ANCHO, LOGO_ECOMFIVE_PNG_BASE64 } from "./logo-ecomfive";
import { destinoCompleto, estadoDropiCompleto, generadoTexto, numeroRetiro, type FichaRetiro } from "./ficha";

const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const MARGEN = 48;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;
const LINEAS_NOTAS_MAX = 10;
/** Por debajo de esta altura empieza el pie de página. */
const LIMITE_PIE = MARGEN + 30;

const TEXTO = rgb(0.09, 0.09, 0.11);
const GRIS = rgb(0.42, 0.42, 0.44);
const CLARO = rgb(0.95, 0.95, 0.96);
const BORDE = rgb(0.86, 0.86, 0.87);
const ROJO = rgb(0.82, 0.19, 0.18);

/** Las fuentes estándar del PDF solo cubren Latin-1: se reemplaza lo que no se puede dibujar. */
export function textoSeguro(texto: string): string {
  return texto
    .replace(/[    ]/g, " ")
    .replace(/₡/g, "CRC ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split(/\r?\n/)) {
    let actual = "";
    for (const palabra of textoSeguro(parrafo).split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) lineas.push(actual);
      actual = palabra;
      while (fuente.widthOfTextAtSize(actual, tam) > ancho && actual.length > 1) {
        let corte = actual.length - 1;
        while (corte > 1 && fuente.widthOfTextAtSize(actual.slice(0, corte), tam) > ancho) corte--;
        lineas.push(actual.slice(0, corte));
        actual = actual.slice(corte);
      }
    }
    lineas.push(actual);
  }
  return lineas.length > 0 ? lineas : [""];
}

/** PDF de una página en formato factura: encabezado con logo, datos, detalle de montos y notas. */
export async function fichaAPdf(ficha: FichaRetiro): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ficha de retiro ${numeroRetiro(ficha.correlativo)}`);
  doc.setAuthor("Ecomfive");
  doc.setCreator("Ecomfive Business OS");
  const pagina = doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(LOGO_ECOMFIVE_PNG_BASE64);

  const dinero = (valor: number) => textoSeguro(formatearMoneda(valor, ficha.codigoPais));
  const derecha = ANCHO_PAGINA - MARGEN;

  function texto(
    valor: string,
    x: number,
    y: number,
    opciones: { fuente?: PDFFont; tam?: number; color?: RGB; alinear?: "izq" | "der" } = {}
  ) {
    const fuente = opciones.fuente ?? normal;
    const tam = opciones.tam ?? 10.5;
    const limpio = textoSeguro(valor);
    const xFinal = opciones.alinear === "der" ? x - fuente.widthOfTextAtSize(limpio, tam) : x;
    pagina.drawText(limpio, { x: xFinal, y, size: tam, font: fuente, color: opciones.color ?? TEXTO });
  }

  function linea(y: number, color = BORDE) {
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: derecha, y }, thickness: 1, color });
  }

  /** Etiqueta pequeña con su valor debajo; devuelve la y donde puede seguir el siguiente dato. */
  function dato(etiqueta: string, valor: string, x: number, y: number, ancho: number): number {
    texto(etiqueta.toUpperCase(), x, y, { fuente: negrita, tam: 7.5, color: GRIS });
    const lineas = partir(valor, normal, 10.5, ancho);
    lineas.forEach((l, i) => texto(l, x, y - 14 - i * 13));
    return y - 14 - lineas.length * 13 - 12;
  }

  // Encabezado
  let y = ALTO_PAGINA - MARGEN;
  const anchoLogo = 132;
  const altoLogo = (anchoLogo * LOGO_ECOMFIVE_ALTO) / LOGO_ECOMFIVE_ANCHO;
  pagina.drawImage(logo, { x: MARGEN, y: y - altoLogo, width: anchoLogo, height: altoLogo });
  texto("FICHA DE RETIRO", derecha, y - 8, { fuente: negrita, tam: 8.5, color: GRIS, alinear: "der" });
  texto(numeroRetiro(ficha.correlativo), derecha, y - 34, { fuente: negrita, tam: 26, alinear: "der" });
  y -= altoLogo + 24;
  linea(y);

  // Datos en dos columnas
  y -= 24;
  const xDerecha = MARGEN + ANCHO_UTIL / 2 + 12;
  const anchoColumna = ANCHO_UTIL / 2 - 12;
  let yIzquierda = y;
  yIzquierda = dato("Plataforma", ficha.plataforma, MARGEN, yIzquierda, anchoColumna);
  yIzquierda = dato("Destino", destinoCompleto(ficha), MARGEN, yIzquierda, anchoColumna);
  yIzquierda = dato("País", ficha.pais, MARGEN, yIzquierda, anchoColumna);
  let yDerecha = y;
  yDerecha = dato("Estado", ficha.estado, xDerecha, yDerecha, anchoColumna);
  yDerecha = dato("Persona asignada", ficha.asignado ?? "Sin asignar", xDerecha, yDerecha, anchoColumna);
  yDerecha = dato("Fecha de creación", formatearFecha(ficha.fecha), xDerecha, yDerecha, anchoColumna);
  if (ficha.fechaLimite) yDerecha = dato("Fecha límite", formatearFecha(ficha.fechaLimite), xDerecha, yDerecha, anchoColumna);
  yDerecha = dato("Estado en Dropi", estadoDropiCompleto(ficha), xDerecha, yDerecha, anchoColumna);
  y = Math.min(yIzquierda, yDerecha) - 4;

  // Detalle de montos
  texto("DETALLE", MARGEN, y, { fuente: negrita, tam: 8.5, color: GRIS });
  y -= 10;
  pagina.drawRectangle({ x: MARGEN, y: y - 24, width: ANCHO_UTIL, height: 24, color: CLARO });
  texto("CONCEPTO", MARGEN + 10, y - 16, { fuente: negrita, tam: 8, color: GRIS });
  texto("MONTO", derecha - 10, y - 16, { fuente: negrita, tam: 8, color: GRIS, alinear: "der" });
  y -= 24;

  const signo = (valor: number) => (valor > 0.005 ? "+ " : valor < -0.005 ? "- " : "");
  const filas: { concepto: string; valor: string; negrita?: boolean; color?: RGB }[] = [
    { concepto: "Monto del retiro", valor: dinero(ficha.monto) },
    { concepto: "Comisión", valor: `- ${dinero(ficha.comision)}` },
    { concepto: "A recibir", valor: dinero(ficha.aRecibir), negrita: true },
  ];
  if (ficha.montoRecibido !== null) {
    const diferencia = ficha.montoRecibido - ficha.aRecibir;
    filas.push({ concepto: "Monto recibido", valor: dinero(ficha.montoRecibido) });
    filas.push({
      concepto: "Diferencia",
      valor: `${signo(diferencia)}${dinero(Math.abs(diferencia))}`,
      color: Math.abs(diferencia) >= 0.005 ? ROJO : undefined,
    });
  }
  for (const fila of filas) {
    if (fila.negrita) pagina.drawRectangle({ x: MARGEN, y: y - 28, width: ANCHO_UTIL, height: 28, color: CLARO });
    const fuente = fila.negrita ? negrita : normal;
    texto(fila.concepto, MARGEN + 10, y - 18, { fuente, tam: fila.negrita ? 11.5 : 10.5 });
    texto(fila.valor, derecha - 10, y - 18, {
      fuente,
      tam: fila.negrita ? 11.5 : 10.5,
      color: fila.color,
      alinear: "der",
    });
    y -= 28;
    linea(y);
  }

  // Cierre
  const cierre: [string, string][] = [];
  if (ficha.fechaCierre) cierre.push(["Fecha de cierre", formatearFecha(ficha.fechaCierre)]);
  if (ficha.soporte) cierre.push(["N.º de soporte", ficha.soporte]);
  if (cierre.length > 0) {
    y -= 22;
    const finales = cierre.map(([etiqueta, valor], i) =>
      dato(etiqueta, valor, i === 0 ? MARGEN : xDerecha, y, anchoColumna)
    );
    y = Math.min(...finales);
  }

  // Notas: solo lo que cabe encima del pie; si no cabe todo, se corta con "..."
  if (ficha.notas && y - 20 > LIMITE_PIE + 14) {
    y -= 20;
    texto("NOTAS", MARGEN, y, { fuente: negrita, tam: 8.5, color: GRIS });
    const maxLineas = Math.min(LINEAS_NOTAS_MAX, Math.floor((y - 10 - LIMITE_PIE - 18) / 13));
    if (maxLineas < 1) {
      texto("Las notas no caben en esta ficha; están en la plataforma.", MARGEN, y - 16, { tam: 9, color: GRIS });
    } else {
      const todas = partir(ficha.notas, normal, 10.5, ANCHO_UTIL - 20);
      const lineas = todas.length > maxLineas ? [...todas.slice(0, maxLineas - 1), `${todas[maxLineas - 1]}...`] : todas;
      const alto = lineas.length * 13 + 18;
      pagina.drawRectangle({
        x: MARGEN,
        y: y - 10 - alto,
        width: ANCHO_UTIL,
        height: alto,
        borderColor: BORDE,
        borderWidth: 1,
      });
      lineas.forEach((l, i) => texto(l, MARGEN + 10, y - 10 - 18 - i * 13 + 5));
    }
  }

  // Pie
  linea(MARGEN + 22);
  texto(`Generado el ${generadoTexto(ficha)} por ${ficha.generadoPor}`, MARGEN, MARGEN + 6, { tam: 8, color: GRIS });
  texto("Ecomfive Business OS", derecha, MARGEN + 6, { tam: 8, color: GRIS, alinear: "der" });

  return doc.save();
}
