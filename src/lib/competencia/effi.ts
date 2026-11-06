// Análisis de competencia con Effi (6 nov 2026): un artículo del catálogo de dropshipping de Effi (`/app/articulo_dropshipping`) tal como lo manda la pestaña
// (scripts/scraping-proveedores-navegador.js › scrapingCompetenciaEffi). Effi no da este catálogo por su API, pero se ve con nuestra cuenta de proveedor y muestra
// las ventas de cada artículo. La lectura viene de una página de internet: nada se da por bueno sin revisarlo. Sin base ni React, con prueba.

import { montoEffi } from "@/lib/effi/articulos";

/** Nuestro proveedor en Effi: la cuenta ECOMFIVE. */
export const NUESTRO_PROVEEDOR_EFFI = 55868;

/** Effi guarda las fotos ahí; el receptor las baja para su huella, así que no se acepta otra dirección. */
const FOTO_PERMITIDA = /^https:\/\/effierp\.s3\.us-east-2\.amazonaws\.com\//;

export interface VistoEffi {
  /** Lo que identifica al artículo entre lecturas (ver `claveEffi`). */
  clave: string;
  /** El código que muestra Effi: cifrado, no se sabe si dura entre sesiones. */
  codigo: string | null;
  nombre: string;
  proveedorId: number;
  proveedorNombre: string;
  esNuestro: boolean;
  /** En colones: el costo al dropshipper y el sugerido. */
  precio: number | null;
  precioSugerido: number | null;
  stock: number | null;
  ventas: number | null;
  categoria: string | null;
  foto: string | null;
}

const texto = (v: unknown, max = 300): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Una cifra entera: «1,234». `null` si no hay un número. */
const entero = (v: unknown): number | null => {
  const m = /^-?[\d,]+/.exec(texto(v, 20));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isSafeInteger(n) ? n : null;
};

/** Un precio en colones («₡4,173»): un monto en otra moneda no se guarda como colones. */
const colones = (v: unknown): number | null => {
  const t = texto(v, 40);
  return /\$|usd|cop/i.test(t) ? null : montoEffi(t);
};

/** Lo que identifica a un artículo entre lecturas: el archivo de su foto, que trae el proveedor, una marca de tiempo y no cambia; sin foto, el proveedor y el nombre. */
export function claveEffi(foto: string | null, proveedorId: number, nombre: string): string {
  const archivo = foto ? /[^/]+$/.exec(new URL(foto).pathname)?.[0] : null;
  return archivo ?? `${proveedorId}-${nombre.toLowerCase()}`.slice(0, 200);
}

/** Un artículo del catálogo, sin confiar en la forma. `null` si no trae nombre o proveedor. */
export function normalizarCompetenciaEffi(o: unknown): VistoEffi | null {
  if (!o || typeof o !== "object") return null;
  const f = o as Record<string, unknown>;
  const nombre = texto(f.nombre);
  const proveedorNombre = texto(f.proveedor, 120);
  const proveedorId = Number(texto(f.proveedorId, 12));
  if (!nombre || !proveedorNombre || !Number.isSafeInteger(proveedorId) || proveedorId <= 0) return null;
  const url = texto(f.foto, 1000);
  const foto = FOTO_PERMITIDA.test(url) ? url : null;
  return {
    clave: claveEffi(foto, proveedorId, nombre),
    codigo: texto(f.codigo, 80) || null,
    nombre,
    proveedorId,
    proveedorNombre,
    esNuestro: proveedorId === NUESTRO_PROVEEDOR_EFFI,
    precio: colones(f.precio),
    precioSugerido: colones(f.sugerido),
    stock: entero(f.stock),
    ventas: entero(f.ventas),
    categoria: texto(f.categoria, 120) || null,
    foto,
  };
}

/** Los artículos de una lectura, revisados y sin repetir. Dos artículos con la misma foto (variantes) se distinguen por el nombre; el mismo artículo repetido entre páginas, no. */
export function catalogoEffi(filas: unknown): VistoEffi[] {
  if (!Array.isArray(filas)) return [];
  const m = new Map<string, VistoEffi>();
  for (const o of filas) {
    const v = normalizarCompetenciaEffi(o);
    if (!v) continue;
    const otro = m.get(v.clave);
    const clave = otro && otro.nombre !== v.nombre ? `${v.clave}|${v.nombre}`.slice(0, 300) : v.clave;
    m.set(clave, { ...v, clave });
  }
  return [...m.values()];
}
