// Análisis de competencia con Drop (6 nov 2026): un producto del catálogo de dropshipper de Drop (`app.soydrop.com/dropshipping`) tal como lo manda la pestaña
// (scripts/scraping-proveedores-navegador.js › scrapingCompetenciaDrop). La lectura viene de una página de internet: nada se da por bueno sin revisarlo. El
// catálogo solo dice el nombre del proveedor, así que por él se le reconoce. Sin base ni React, con prueba.

import { fotoDeDrop, leerInventarioDrop, leerPrecioDrop } from "@/lib/publicaciones-drop/lectura";

/** Nuestro proveedor en Drop. */
export const NUESTRO_PROVEEDOR_DROP = /^ecomfive\b/i;

/** Drop guarda las fotos en Google Cloud Storage; lo demás (el dibujo por defecto) no es una foto del producto, y el receptor baja estas fotos para su huella. */
const FOTO_PERMITIDA = /^https:\/\/storage\.googleapis\.com\//;

export interface VistoDrop {
  dropId: string;
  /** El ID público («ID-ONWAG»). */
  codigo: string | null;
  nombre: string;
  proveedorNombre: string;
  esNuestro: boolean;
  /** En colones: el precio al dropshipper y el sugerido. */
  precio: number | null;
  precioSugerido: number | null;
  stock: number | null;
  categoria: string | null;
  creadoEnDrop: string | null;
  foto: string | null;
}

const texto = (v: unknown, max = 300): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Un precio en colones («c5721.45»): la lectura se hace sin «Ver en USD», y un monto en dólares no se guarda como colones. */
const colones = (v: unknown): number | null => (/\$|usd/i.test(texto(v, 40)) ? null : leerPrecioDrop(texto(v, 40)));

/** Un número estable para un proveedor de Drop, que no tiene ID en el catálogo: las pestañas de competencia identifican a cada competidor con un número. */
export function idDeProveedorDrop(nombre: string): number {
  let h = 2166136261;
  for (const c of nombre.trim().toLowerCase()) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Un producto del catálogo, sin confiar en la forma. `null` si no trae ID, nombre o proveedor. */
export function normalizarCompetenciaDrop(o: unknown): VistoDrop | null {
  if (!o || typeof o !== "object") return null;
  const f = o as Record<string, unknown>;
  const dropId = texto(f.dropId, 24);
  const nombre = texto(f.nombre);
  const proveedorNombre = texto(f.proveedor, 120);
  if (!/^[0-9a-f]{24}$/.test(dropId) || !nombre || !proveedorNombre) return null;
  const codigo = texto(f.codigo, 12);
  const foto = fotoDeDrop(texto(f.foto, 2000));
  const creado = texto(f.creado, 40);
  return {
    dropId,
    codigo: /^ID-[A-Z0-9]{3,9}$/.test(codigo) ? codigo : null,
    nombre,
    proveedorNombre,
    esNuestro: NUESTRO_PROVEEDOR_DROP.test(proveedorNombre),
    precio: colones(f.precio),
    precioSugerido: colones(f.sugerido),
    stock: leerInventarioDrop(texto(f.stock, 40)),
    categoria: texto(f.categoria, 120) || null,
    creadoEnDrop: /^\d{4}-\d{2}-\d{2}T/.test(creado) && !Number.isNaN(Date.parse(creado)) ? creado : null,
    foto: foto && FOTO_PERMITIDA.test(foto) ? foto : null,
  };
}

/** Los productos de una lectura, revisados y sin repetir. */
export function catalogoDrop(filas: unknown): VistoDrop[] {
  if (!Array.isArray(filas)) return [];
  const m = new Map<string, VistoDrop>();
  for (const o of filas) {
    const v = normalizarCompetenciaDrop(o);
    if (v) m.set(v.dropId, v);
  }
  return [...m.values()];
}
