// El recibo de Oceans firmado por el delivery (25 nov 2026, pantalla 5 del prototipo aprobado https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX): el
// texto de la hoja «RECIBOS DE PAGOS» de Yiletsi, con lo de la semana por tienda, propinas y ajustes, la declaración de trabajador independiente y la
// firma dibujada en la app con su fecha, hora y código de verificación. Se arma en el servidor con pdf-lib al firmar. Sin base ni React; con prueba.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { partirEnLineas, textoPdf } from "../tabla/pdf";
import { nombreTienda, TIENDAS_OCEANS, type Ajuste, type ResumenDelivery } from "./control-envios";

export interface DatosRecibo {
  numero: string;
  /** «del 19 al 25 de noviembre de 2026». */
  semana: string;
  fechaPago: string;
  formaPago: string;
  nombreCompleto: string;
  /** Su nombre en el sistema («July Calle»). */
  nombre: string;
  cedula: string;
  lineas: { detalle: string; monto: number }[];
  total: number;
  /** «95 entregas × $3.65 · …». */
  explicacion: string;
  firmadoEn: string;
  codigo: string;
  /** La firma (PNG); sin ella, el recibo sale «sin firmar» (vista previa). */
  firma: Uint8Array | null;
}

export const EMPRESA = { nombre: "OCEANS ECOMMERCE S.A.", ruc: "155724062-2-2022 DV 78" };

export const DECLARACION =
  "Declaro haber recibido a satisfacción el pago indicado por servicios de delivery prestados como trabajador independiente. El presente pago no constituye salario ni genera relación laboral, prestaciones ni derechos conforme al Código de Trabajo de la República de Panamá.";

const MORADO = rgb(0.357, 0.137, 0.525);
const TEXTO = rgb(0.094, 0.094, 0.106);
const GRIS = rgb(0.388, 0.388, 0.388);
const monto = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function reciboPdf(d: DatosRecibo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoPdf(`Recibo ${d.numero}`));
  doc.setAuthor("Oceans Ecommerce S.A.");
  const pagina = doc.addPage([612, 792]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const izq = 64;
  const der = 612 - 64;
  const ancho = der - izq;
  let y = 730;
  const centro = (t: string, tam: number, f = normal, color = TEXTO) => {
    const s = textoPdf(t);
    pagina.drawText(s, { x: (612 - f.widthOfTextAtSize(s, tam)) / 2, y, size: tam, font: f, color });
  };
  const parrafo = (t: string, tam: number, f = normal, color = TEXTO, salto = tam + 4) => {
    for (const linea of partirEnLineas(textoPdf(t), (s) => f.widthOfTextAtSize(s, tam), ancho, 20)) {
      pagina.drawText(linea, { x: izq, y, size: tam, font: f, color });
      y -= salto;
    }
  };

  centro("OCEANS ECOMMERCE", 10, negrita, MORADO);
  y -= 20;
  centro("RECIBO DE SERVICIOS - DELIVERY INDEPENDIENTE", 14, negrita);
  y -= 16;
  centro(d.semana.charAt(0).toUpperCase() + d.semana.slice(1), 10, normal, GRIS);
  y -= 34;

  const datos: [string, string][] = [
    ["Recibo No.:", d.numero],
    ["Fecha de pago:", d.fechaPago],
    ["Método de pago:", d.formaPago],
    ["Moneda:", "USD"],
    ["Empresa:", "Oceans Ecommerce S.A."],
    ["RUC:", EMPRESA.ruc],
    ["Repartidor:", `${d.nombreCompleto} (${d.nombre})`],
    ["Cédula / Pasaporte:", d.cedula],
  ];
  for (const [k, v] of datos) {
    pagina.drawText(textoPdf(k), { x: izq, y, size: 10, font: negrita, color: TEXTO });
    pagina.drawText(textoPdf(v), { x: izq + 130, y, size: 10, font: normal, color: TEXTO });
    y -= 16;
  }
  y -= 14;

  pagina.drawText("Detalle", { x: izq, y, size: 10, font: negrita, color: TEXTO });
  pagina.drawText("Monto", { x: der - negrita.widthOfTextAtSize("Monto", 10), y, size: 10, font: negrita, color: TEXTO });
  y -= 6;
  pagina.drawLine({ start: { x: izq, y }, end: { x: der, y }, thickness: 0.8, color: TEXTO });
  y -= 15;
  for (const l of d.lineas) {
    const m = monto(l.monto);
    pagina.drawText(textoPdf(l.detalle), { x: izq, y, size: 10, font: normal, color: TEXTO });
    pagina.drawText(m, { x: der - normal.widthOfTextAtSize(m, 10), y, size: 10, font: normal, color: TEXTO });
    y -= 16;
  }
  y += 6;
  pagina.drawLine({ start: { x: izq, y }, end: { x: der, y }, thickness: 0.8, color: TEXTO });
  y -= 15;
  const total = monto(d.total);
  pagina.drawText("TOTAL RECIBIDO", { x: izq, y, size: 11, font: negrita, color: TEXTO });
  pagina.drawText(total, { x: der - negrita.widthOfTextAtSize(total, 11), y, size: 11, font: negrita, color: TEXTO });
  y -= 22;
  parrafo(`${d.explicacion} El detalle día por día está en el sistema.`, 9, normal, GRIS);
  y -= 14;

  pagina.drawText("Declaración de recibido", { x: izq, y, size: 10, font: negrita, color: TEXTO });
  y -= 15;
  parrafo(DECLARACION, 10, normal, TEXTO, 14);

  // El recuadro de la firma, abajo.
  const alto = 150;
  const base = 64;
  pagina.drawRectangle({ x: izq, y: base, width: ancho, height: alto, borderColor: TEXTO, borderWidth: 0.8 });
  pagina.drawText("Firma del repartidor:", { x: izq + 12, y: base + alto - 20, size: 10, font: negrita, color: TEXTO });
  if (d.firma) {
    const img = await doc.embedPng(d.firma);
    const escala = Math.min(260 / img.width, 70 / img.height);
    pagina.drawImage(img, { x: izq + 12, y: base + 48, width: img.width * escala, height: img.height * escala });
  } else {
    pagina.drawText("(sin firmar)", { x: izq + 12, y: base + 70, size: 10, font: normal, color: GRIS });
  }
  y = base + 34;
  const pie = `Firmado electrónicamente por ${d.nombreCompleto}, cédula ${d.cedula}, el ${d.firmadoEn} (hora de Panamá) desde su panel de repartidor.`;
  for (const linea of partirEnLineas(textoPdf(pie), (s) => normal.widthOfTextAtSize(s, 8), ancho - 24, 3)) {
    pagina.drawText(linea, { x: izq + 12, y, size: 8, font: normal, color: TEXTO });
    y -= 11;
  }
  pagina.drawText(textoPdf(`Código de verificación: ${d.codigo}`), { x: izq + 12, y, size: 8, font: normal, color: GRIS });
  return doc.save();
}

const plata = (n: number) => `$${monto(n)}`;
const fechaLarga = (iso: string) => iso.split("-").reverse().join("/");

/** Lo que lleva el recibo de una semana: las tiendas de Oceans en su orden, las propinas, cada ajuste con su motivo y el total. */
export function armarRecibo(p: {
  numero: string;
  semana: string;
  fechaPago: string;
  formaPago: string;
  nombreCompleto: string;
  nombre: string;
  cedula: string;
  resumen: Pick<ResumenDelivery, "porTienda" | "propinas" | "clicksi" | "totalOceans" | "lineas">;
  ajustes: Ajuste[];
  firmadoEn: string;
  codigo: string;
  firma: Uint8Array | null;
}): DatosRecibo {
  const orden = (t: string) => {
    const i = (TIENDAS_OCEANS as readonly string[]).indexOf(t);
    return i < 0 ? 99 : i;
  };
  const tiendas = Object.entries(p.resumen.porTienda).sort(([a], [b]) => orden(a) - orden(b) || a.localeCompare(b));
  const lineas = [
    ...tiendas.map(([t, m]) => ({ detalle: `Envíos ${nombreTienda(t)}`, monto: m })),
    ...(p.resumen.propinas ? [{ detalle: "Propinas", monto: p.resumen.propinas }] : []),
    ...p.ajustes.filter((a) => a.tipo === "ajuste").map((a) => ({ detalle: a.motivo, monto: a.monto })),
  ];
  if (!lineas.length) lineas.push({ detalle: "Envíos de la semana", monto: 0 });
  const usados = p.resumen.lineas.filter((l) => l.cantidad > 0).map((l) => `${l.cantidad} ${l.texto} × ${plata(l.tarifa)}`);
  const explicacion = [
    usados.length ? `${usados.join(" · ")}.` : "Sin pedidos pagados.",
    p.resumen.clicksi ? `Lo de ClickSi (${plata(p.resumen.clicksi)}) lo paga ClickSi aparte y no va en este recibo.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    numero: p.numero,
    semana: p.semana,
    fechaPago: fechaLarga(p.fechaPago),
    formaPago: p.formaPago,
    nombreCompleto: p.nombreCompleto,
    nombre: p.nombre,
    cedula: p.cedula,
    lineas,
    total: p.resumen.totalOceans,
    explicacion,
    firmadoEn: p.firmadoEn,
    codigo: p.codigo,
    firma: p.firma,
  };
}
