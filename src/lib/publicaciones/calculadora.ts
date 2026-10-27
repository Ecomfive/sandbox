// Gestión de IDs Dropi › Calculadora de margen (pedido de Hernán, 27 oct 2026): con el costo de mercancía, el fulfillment y el precio
// de venta, la utilidad y el margen (la misma cuenta que la base hace en dropi_publicaciones, migración 0116) y el texto para mandarlo
// por WhatsApp. Sin base ni React, para poder probarlo.

export interface DatosCalculo {
  costo: number;
  fulfillment: number;
  precio: number;
}

export interface ResultadoCalculo {
  utilidad: number;
  /** Utilidad ÷ precio (0,48 = 48 %). */
  margen: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** «8,99», «$8.99», « 8.99 » → 8.99; vacío o no numérico → null. */
export function leerMonto(texto: string): number | null {
  const limpio = String(texto ?? "").replace(/[$\s]/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Utilidad = precio − costo de mercancía − fulfillment; margen = utilidad ÷ precio. Sin precio no hay margen (null). */
export function calcularMargen(d: DatosCalculo): ResultadoCalculo | null {
  if (!(d.precio > 0)) return null;
  const utilidad = centavos(d.precio - d.costo - d.fulfillment);
  return { utilidad, margen: utilidad / d.precio };
}

/** El precio más bajo (redondeado hacia arriba al centavo) con el que el margen llega a `margen` (0,3 = 30 %). */
export function precioParaMargen(costo: number, fulfillment: number, margen: number): number | null {
  if (!(margen < 1) || costo + fulfillment <= 0) return null;
  return Math.ceil(((costo + fulfillment) / (1 - margen)) * 100 - 1e-6) / 100;
}

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

/**
 * El cálculo como mensaje de WhatsApp: el nombre en negrita (con su ID de Dropi si lo tiene) y una línea por dato. El coste real (lo
 * que costó la última compra) va solo si se conoce.
 */
export function textoWhatsapp(p: { nombre: string; idDropi?: string | null; costeReal?: number | null }, d: DatosCalculo, r: ResultadoCalculo): string {
  const nombre = p.nombre.trim().replace(/\*/g, "");
  const lineas = [
    nombre ? `*${nombre}*${p.idDropi?.trim() ? ` · ID ${p.idDropi.trim()}` : ""}` : p.idDropi?.trim() ? `*ID ${p.idDropi.trim()}*` : "*Cálculo de margen*",
    ...(p.costeReal != null ? [`Coste real: ${usd(p.costeReal)}`] : []),
    `Costo de mercancía: ${usd(d.costo)}`,
    `Fulfillment: ${usd(d.fulfillment)}`,
    `Precio de venta: ${usd(d.precio)}`,
    `Utilidad: ${usd(r.utilidad)}`,
    `Margen: ${Math.round(r.margen * 100)} %`,
  ];
  return lineas.join("\n");
}
