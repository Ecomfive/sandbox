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
export function textoWhatsapp(
  p: { nombre: string; idDropi?: string | null; costeReal?: number | null },
  d: DatosCalculo,
  r: ResultadoCalculo,
  /** Cómo escribir los montos (Costa Rica: en dólares con los colones entre paréntesis, 31 oct 2026); en dólares por omisión. El coste real (de Compras) va siempre en dólares. */
  monto: (n: number) => string = usd,
): string {
  const nombre = p.nombre.trim().replace(/\*/g, "");
  const lineas = [
    nombre ? `*${nombre}*${p.idDropi?.trim() ? ` · ID ${p.idDropi.trim()}` : ""}` : p.idDropi?.trim() ? `*ID ${p.idDropi.trim()}*` : "*Cálculo de margen*",
    ...(p.costeReal != null ? [`Coste real: ${usd(p.costeReal)}`] : []),
    `Costo de mercancía: ${monto(d.costo)}`,
    `Fulfillment: ${monto(d.fulfillment)}`,
    `Precio de venta: ${monto(d.precio)}`,
    `Utilidad: ${monto(r.utilidad)}`,
    `Margen: ${Math.round(r.margen * 100)} %`,
  ];
  return lineas.join("\n");
}

/** Lo que la calculadora necesita saber de una publicación para armar la lista de productos por SKU. */
export interface PublicacionParaCalculo {
  numero: number | null;
  dropiId: string;
  archivada: boolean;
  duplicadaDe: string | null;
  sinPublicar: boolean;
  tipoDropi: "publico" | "privado" | null;
  sku: { id: string; codigo: string; nombre: string } | null;
}

export interface ProductoDeCalculadora<T extends PublicacionParaCalculo> {
  sku: { id: string; codigo: string; nombre: string };
  /** La publicación de la que salen los costos y el precio: la pública y al día; las privadas y las apagadas, solo si no hay otra. */
  representante: T;
}

/**
 * Los productos que se pueden elegir en la calculadora (27 oct 2026, pedido de Jhokser): **uno por SKU**, no uno por publicación.
 * Un producto con su público y sus privadas «P-MA …» sale una sola vez; sus datos vienen de la publicación pública al día (con ID de
 * Dropi, la de número más bajo). Un SKU que solo tiene publicaciones archivadas, duplicadas o sin publicar no sale; una publicación sin
 * SKU vinculado tampoco (se escribe a mano). Ordenados por código.
 */
export function productosPorSku<T extends PublicacionParaCalculo>(publicaciones: T[]): ProductoDeCalculadora<T>[] {
  const peso = (p: T) => (p.tipoDropi === "privado" ? 2 : 0) + (p.dropiId.trim() ? 0 : 1);
  const porSku = new Map<string, { sku: ProductoDeCalculadora<T>["sku"]; mejor: T }>();
  for (const p of publicaciones) {
    if (!p.sku || p.archivada || p.duplicadaDe || p.sinPublicar) continue;
    const previo = porSku.get(p.sku.id);
    if (!previo || peso(p) < peso(previo.mejor) || (peso(p) === peso(previo.mejor) && (p.numero ?? Infinity) < (previo.mejor.numero ?? Infinity))) {
      porSku.set(p.sku.id, { sku: p.sku, mejor: p });
    }
  }
  return [...porSku.values()].map((x) => ({ sku: x.sku, representante: x.mejor })).sort((a, b) => a.sku.codigo.localeCompare(b.sku.codigo, "es"));
}
