"use client";

import { useState } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { textoCotizacion, type ColorPunto, type Cotizacion } from "@/lib/compras/cotizacion";
import { CopiarIcon } from "@/lib/nav-icons";
import { obtenerCotizacionCompra } from "./actions";

// La imagen siempre sale clara (es lo que se pega en WhatsApp), así que sus colores son fijos y no del tema.
const TINTA = "#18181b";
const GRIS = "#5f5f6b";
const LINEA = "#d4d4d8";
const FONDO_ENCABEZADO = "#f1f1f4";
const PUNTO: Record<ColorPunto, string> = { rojo: "#dc2626", amarillo: "#eab308", verde: "#16a34a" };
const LETRA = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const ANCHO = 900;
const MARGEN = 24;
const ESCALA = 2;

const usd = (x: number | null, decimales = 2) =>
  x === null ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

function partirEnLineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function cargarFoto(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = url;
  });
}

/** Dibuja la cotización como la pegaba el equipo: arriba las métricas del test y abajo la fila del sheet de cotizaciones. */
async function dibujar(c: Cotizacion): Promise<Blob> {
  const foto = await cargarFoto(c.fotoUrl);
  const filaMetrica = 30;
  const altoMetricas = c.metricas ? 34 + filaMetrica * (c.metricas.filas.length + 1) + 24 : 0;
  const columnas = [
    { titulo: "Product", ancho: 214 },
    { titulo: "Picture", ancho: 128 },
    { titulo: "Destination", ancho: 112 },
    { titulo: "Logistics Solution", ancho: 128 },
    { titulo: "Quantity", ancho: 90 },
    { titulo: "Amount ($)", ancho: 88 },
    { titulo: "Amount per unit ($)", ancho: 92 },
  ];
  const altoEncabezado = 48;
  const altoFila = 124;
  const alto = MARGEN + altoMetricas + altoEncabezado + altoFila + MARGEN;

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO * ESCALA;
  lienzo.height = alto * ESCALA;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ANCHO, alto);
  ctx.textBaseline = "middle";
  const anchoTabla = ANCHO - MARGEN * 2;
  let y = MARGEN;

  if (c.metricas) {
    ctx.fillStyle = TINTA;
    ctx.font = `700 17px ${LETRA}`;
    ctx.fillText(c.metricas.titulo, MARGEN, y + 12);
    y += 34;
    const anchoNombre = 300;
    const anchoMetricas = 520;
    const filas = [{ nombre: "Métrica", valor: "Valor", color: null as ColorPunto | null }, ...c.metricas.filas];
    filas.forEach((f, i) => {
      const fy = y + i * filaMetrica;
      if (i === 0) {
        ctx.fillStyle = FONDO_ENCABEZADO;
        ctx.fillRect(MARGEN, fy, anchoMetricas, filaMetrica);
      }
      ctx.strokeStyle = LINEA;
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGEN + 0.5, fy + 0.5, anchoNombre, filaMetrica);
      ctx.strokeRect(MARGEN + anchoNombre + 0.5, fy + 0.5, anchoMetricas - anchoNombre, filaMetrica);
      ctx.fillStyle = i === 0 ? GRIS : TINTA;
      ctx.font = `${i === 0 ? 600 : 400} 14px ${LETRA}`;
      ctx.fillText(f.nombre, MARGEN + 10, fy + filaMetrica / 2);
      let x = MARGEN + anchoNombre + 10;
      if (f.color) {
        ctx.fillStyle = PUNTO[f.color];
        ctx.beginPath();
        ctx.arc(x + 6, fy + filaMetrica / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        x += 18;
      }
      ctx.fillStyle = i === 0 ? GRIS : TINTA;
      ctx.font = `${i === 0 ? 600 : 500} 14px ${LETRA}`;
      ctx.fillText(f.valor, x, fy + filaMetrica / 2);
    });
    y += filaMetrica * filas.length + 24;
  }

  // La fila del sheet de cotizaciones.
  let x = MARGEN;
  ctx.fillStyle = FONDO_ENCABEZADO;
  ctx.fillRect(MARGEN, y, anchoTabla, altoEncabezado);
  for (const col of columnas) {
    ctx.strokeStyle = LINEA;
    ctx.strokeRect(x + 0.5, y + 0.5, col.ancho, altoEncabezado);
    ctx.strokeRect(x + 0.5, y + altoEncabezado + 0.5, col.ancho, altoFila);
    ctx.fillStyle = TINTA;
    ctx.font = `600 13px ${LETRA}`;
    ctx.textAlign = "center";
    const lineas = partirEnLineas(ctx, col.titulo, col.ancho - 12);
    lineas.forEach((l, i) => ctx.fillText(l, x + col.ancho / 2, y + altoEncabezado / 2 + (i - (lineas.length - 1) / 2) * 16));
    x += col.ancho;
  }
  const fy = y + altoEncabezado;
  const centro = fy + altoFila / 2;
  const valores = [c.producto, "", c.destino, c.logistica || "—", c.cantidad === null ? "—" : c.cantidad.toLocaleString("en-US"), usd(c.monto), usd(c.porUnidad)];
  x = MARGEN;
  columnas.forEach((col, i) => {
    if (i === 1) {
      if (foto) {
        const lado = Math.min(col.ancho, altoFila) - 16;
        const proporcion = Math.max(lado / foto.naturalWidth, lado / foto.naturalHeight);
        const sw = lado / proporcion;
        const sh = lado / proporcion;
        ctx.drawImage(foto, (foto.naturalWidth - sw) / 2, (foto.naturalHeight - sh) / 2, sw, sh, x + (col.ancho - lado) / 2, centro - lado / 2, lado, lado);
      } else {
        ctx.fillStyle = GRIS;
        ctx.font = `400 12px ${LETRA}`;
        ctx.fillText("Sin foto", x + col.ancho / 2, centro);
      }
    } else {
      ctx.fillStyle = TINTA;
      ctx.font = `${i === 0 ? 500 : 400} 14px ${LETRA}`;
      const lineas = partirEnLineas(ctx, valores[i], col.ancho - 16).slice(0, 6);
      lineas.forEach((l, k) => ctx.fillText(l, x + col.ancho / 2, centro + (k - (lineas.length - 1) / 2) * 18));
    }
    x += col.ancho;
  });

  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("sin imagen"))), "image/png"));
}

/** Un error con mensaje para la persona (el de la acción); los del navegador salen en inglés y no se muestran. */
class ErrorDelServidor extends Error {}

/**
 * Botón «Copiar cotización» de la ficha de una compra: deja en el portapapeles una imagen con las métricas del test y la
 * fila de la cotización, lista para pegar en WhatsApp (Ctrl V). Si el navegador no deja copiar imágenes, copia el texto.
 */
export function CopiarCotizacionBoton({ compraId }: { compraId: string }) {
  const { mostrarToast } = useToast();
  const [copiando, setCopiando] = useState(false);

  async function alHacerClic() {
    setCopiando(true);
    // La consulta y el dibujo van dentro de la promesa del ClipboardItem: el navegador exige que la copia empiece en el clic.
    const datos = obtenerCotizacionCompra(compraId).then((r) => {
      if ("error" in r) throw new ErrorDelServidor(r.error);
      return r.cotizacion;
    });
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("sin imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": datos.then(dibujar) })]);
      mostrarToast("Cotización copiada: pégala en WhatsApp con Ctrl V");
    } catch {
      try {
        const c = await datos;
        await navigator.clipboard.writeText(textoCotizacion(c));
        mostrarToast("Se copió como texto (este navegador no deja copiar la imagen)");
      } catch (e) {
        mostrarToast(e instanceof ErrorDelServidor ? e.message : "El navegador no dejó copiar. Vuelve a pulsar «Copiar cotización».", "destructive");
      }
    } finally {
      setCopiando(false);
    }
  }

  return (
    <BotonAccion icono={CopiarIcon} onClick={alHacerClic} disabled={copiando}>
      {copiando ? "Copiando..." : "Copiar cotización"}
    </BotonAccion>
  );
}
