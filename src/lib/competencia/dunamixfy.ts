// Análisis de competencia con Dunamixfy (11 nov 2026): un producto del Marketplace de dunamixfy.cr tal como lo manda la pestaña
// (scripts/scraping-proveedores-navegador.js › scrapingCompetenciaDunamixfy), que lo toma de la API interna del Marketplace con una cuenta de DROPSHIPPER
// (con la de proveedor solo se ven nuestros productos). La lectura viene de una página de internet: nada se da por bueno sin revisarlo. Sin base ni React, con prueba.

import { idDeProveedorDrop } from "./drop";

/** Nuestro proveedor en Dunamixfy: así se llama la cuenta de ECOMFIVE en el Marketplace. */
export const NUESTRO_PROVEEDOR_DUNAMIXFY = "Dunamix EF";

/**
 * Dunamixfy guarda las fotos en Cloudflare R2 o, las más viejas, en su Cloudinary (la API da solo el código, como «qkjta8yaakegdemtjc18», y la página arma la
 * dirección; 217 de 484 el 11 nov 2026). El receptor las baja para su huella, así que no se acepta otra dirección.
 */
const FOTO_PERMITIDA = /^https:\/\/(pub-[a-z0-9]+\.r2\.dev|res\.cloudinary\.com\/dw3jc9fg5\/image\/upload)\//;
const CLOUDINARY = "https://res.cloudinary.com/dw3jc9fg5/image/upload/";

/** La dirección de una foto: la que trae o, si es un código de Cloudinary, la que arma la página de Dunamixfy. `null` si no es de ahí. */
export function fotoDunamixfy(v: unknown): string | null {
  const t = texto(v, 1000);
  const url = /^[a-z0-9_-]{6,120}$/i.test(t) ? CLOUDINARY + t : t;
  return FOTO_PERMITIDA.test(url) ? url : null;
}

/** El Marketplace no tiene una página por proveedor: el enlace de cada competidor abre el Marketplace. */
export const MARKETPLACE_DUNAMIXFY = "https://dunamixfy.cr/marketplace";

export interface VistoDunamixfy {
  /** El número del producto en Dunamixfy («#837»), que no cambia. */
  clave: string;
  nombre: string;
  /** El id del proveedor en Dunamixfy (su nombre es un código como «Dunamix NS» y puede cambiar). */
  proveedorId: string;
  proveedorNombre: string;
  esNuestro: boolean;
  /** En colones: lo que paga el dropshipper (el menor de sus variantes) y el precio sugerido de esa misma variante. */
  precio: number | null;
  precioSugerido: number | null;
  /** La suma de los inventarios activos (Dunamixfy deja filas apagadas o borradas). */
  stock: number | null;
  categoria: string | null;
  foto: string | null;
  creadoEnDunamixfy: string | null;
}

const texto = (v: unknown, max = 300): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Un monto en colones: un número mayor o igual a 0 y menor que mil millones. */
const monto = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : null);

const fecha = (v: unknown): string | null => {
  const t = texto(v, 40);
  return t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : null;
};

/** El número de un proveedor para las pestañas (usan números): el mismo hash de Drop sobre su id. */
export const idDeProveedorDunamixfy = (id: string): number => idDeProveedorDrop(id);

/**
 * Un producto del Marketplace, sin confiar en la forma. `null` si no trae número, nombre o proveedor, o si no le queda ningún inventario activo y público
 * (un inventario privado es de un solo dropshipper).
 */
export function normalizarCompetenciaDunamixfy(o: unknown): VistoDunamixfy | null {
  if (!o || typeof o !== "object") return null;
  const f = o as Record<string, unknown>;
  const numero = typeof f.num === "number" && Number.isSafeInteger(f.num) && f.num > 0 && f.num < 1e9 ? String(f.num) : "";
  const nombre = texto(f.nombre);
  const proveedorId = texto(f.proveedorId, 60);
  const proveedorNombre = texto(f.proveedor, 120);
  if (!numero || !nombre || !/^[a-z0-9]{10,40}$/i.test(proveedorId) || !proveedorNombre) return null;
  const inventarios = (Array.isArray(f.inventarios) ? (f.inventarios as Record<string, unknown>[]) : []).filter(
    (i) => i && typeof i === "object" && i.activo === true && !i.eliminado && !i.privado,
  );
  if (!inventarios.length) return null;
  const conPrecio = inventarios.filter((i) => monto(i.precio) !== null).sort((a, b) => (monto(a.precio) ?? 0) - (monto(b.precio) ?? 0));
  const stock = inventarios.reduce((t, i) => t + (typeof i.stock === "number" && Number.isSafeInteger(i.stock) && i.stock > 0 ? i.stock : 0), 0);
  return {
    clave: numero,
    nombre,
    proveedorId,
    proveedorNombre,
    esNuestro: proveedorNombre === NUESTRO_PROVEEDOR_DUNAMIXFY,
    precio: conPrecio.length ? monto(conPrecio[0].precio) : null,
    precioSugerido: conPrecio.length ? monto(conPrecio[0].sugerido) : null,
    stock,
    categoria: texto(f.categoria, 120) || null,
    foto: fotoDunamixfy(f.foto),
    creadoEnDunamixfy: fecha(f.creado),
  };
}

/** Los productos de una lectura, revisados y sin repetir (el mismo número entre páginas cuenta una vez). */
export function catalogoDunamixfy(filas: unknown): VistoDunamixfy[] {
  if (!Array.isArray(filas)) return [];
  const m = new Map<string, VistoDunamixfy>();
  for (const o of filas) {
    const v = normalizarCompetenciaDunamixfy(o);
    if (v && !m.has(v.clave)) m.set(v.clave, v);
  }
  return [...m.values()];
}
