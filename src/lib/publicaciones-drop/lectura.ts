// Gestión de IDs Drop › lo que se lee de Drop (app.soydrop.com, 3 nov 2026, pedido de Hernán). La pestaña de Drop, con la sesión del proveedor,
// recorre «Mis productos» página por página y manda el texto de cada fila tal cual (scripts/scraping-proveedores-navegador.js › leerDrop); aquí se
// revisa y se pasa a datos (scripts/drop-guardar.ts). La lectura viene de una página de internet: nada se da por bueno sin revisarlo. Sin base ni
// React, con prueba (lectura.test.ts).

import type { EstadoDrop } from "./acciones";

/** Una fila de «Mis productos» de Drop como la manda la pestaña: los textos de cada columna. */
export interface FilaLeidaDrop {
  /** El id interno del producto en Drop (24 hexadecimales, el de `/vendor/products/details/<id>/inventory`). */
  dropId: string;
  /** La celda «Producto»: el nombre y el ID corto («Rhodiola Rosea ID-ONWAG»). */
  producto: string;
  sku: string;
  estado: string;
  /** «c5721.45» (colones). */
  precio: string;
  /** «494 total». */
  inventario: string;
  /** «31/10/2026, 08:03 a. m.» (hora de Costa Rica). */
  creado: string;
  /** El `src` de la foto: la dirección de la imagen o `/_next/image?url=…`. */
  foto: string | null;
  /** «Producto exclusivo» de su ficha (extensión 0.7.2): lo que Drop guarda aparte para cada cliente; null si no se pudo leer, ausente en lecturas viejas. */
  exclusivos?: unknown;
}

/** Lo que Drop guarda aparte para un cliente: no entra en el «Inventario» de la tabla, pero es stock nuestro en la bodega de Drop. */
export interface ExclusivoDrop {
  cliente: string;
  variante: string | null;
  cantidad: number;
  activo: boolean;
}

/** Una publicación de Drop ya revisada, lista para guardar. */
export interface PublicacionLeidaDrop {
  dropId: string;
  /** El ID corto que muestra Drop («ID-ONWAG»); null si no vino. */
  codigo: string | null;
  nombre: string;
  skuDrop: string | null;
  estado: EstadoDrop;
  precio: number | null;
  inventario: number | null;
  creadoEnDrop: string | null;
  fotoUrl: string | null;
  /** Los exclusivos leídos (null = la lectura no los trajo: se conserva lo que había). */
  exclusivos: ExclusivoDrop[] | null;
}

/** Los exclusivos de una fila, revisados: cliente, variante, unidades (entero ≥ 0) y si está activo; null si no vinieron. */
export function leerExclusivosDrop(v: unknown): ExclusivoDrop[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 200).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const cantidad = Math.max(0, Math.floor(Number(o.cantidad) || 0));
    return [{ cliente: texto(o.cliente, 120), variante: texto(o.variante, 120) || null, cantidad, activo: o.activo !== false }];
  });
}

/** Las unidades exclusivas que cuentan como stock: las de los exclusivos activos. */
export const unidadesExclusivas = (l: ExclusivoDrop[]): number => l.filter((x) => x.activo).reduce((t, x) => t + x.cantidad, 0);

const texto = (v: unknown, max = 300): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** «c5721.45», «₡5,721.45», «5.721,45» → 5721.45; null si no hay un número. */
export function leerPrecioDrop(t: string): number | null {
  let s = texto(t, 40).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const punto = s.lastIndexOf(".");
  const coma = s.lastIndexOf(",");
  // El último separador es el decimal si le siguen 1 o 2 cifras; los demás son de miles.
  const ultimo = Math.max(punto, coma);
  if (ultimo >= 0 && s.length - ultimo - 1 <= 2 && s.length - ultimo - 1 > 0) s = `${s.slice(0, ultimo).replace(/[.,]/g, "")}.${s.slice(ultimo + 1)}`;
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}

/** «494 total» → 494; null si no hay un número. */
export function leerInventarioDrop(t: string): number | null {
  const m = /^\s*(\d{1,9})/.exec(texto(t, 40).replace(/[.,](?=\d{3}\b)/g, ""));
  return m ? Number(m[1]) : null;
}

/** «31/10/2026, 08:03 a. m.» (hora de Costa Rica, UTC−6) → «2026-10-31T14:03:00.000Z»; null si no se entiende. */
export function leerFechaDrop(t: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i.exec(texto(t, 60));
  if (!m) return null;
  const [d, mes, a, h, min] = m.slice(1, 6).map(Number);
  if (h < 1 || h > 12 || min > 59) return null;
  const hora = (h % 12) + (m[6].toLowerCase() === "p" ? 12 : 0);
  const fecha = new Date(Date.UTC(a, mes - 1, d, hora + 6, min));
  // El día y el mes tienen que existir (un 31/02 no): vuelto a la hora de Costa Rica, debe dar la misma fecha.
  const local = new Date(fecha.getTime() - 6 * 3_600_000);
  return local.getUTCDate() === d && local.getUTCMonth() === mes - 1 && local.getUTCFullYear() === a ? fecha.toISOString() : null;
}

/** La dirección real de la foto: la de `/_next/image?url=…` o la que venga; solo `https:`. */
export function fotoDeDrop(src: string | null | undefined): string | null {
  const s = texto(src, 2000);
  if (!s) return null;
  let url = s;
  if (s.startsWith("/_next/image")) {
    const p = new URLSearchParams(s.slice(s.indexOf("?") + 1)).get("url");
    if (!p) return null;
    url = p;
  }
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Una fila de la pestaña, revisada; null si no sirve (sin id de Drop válido o sin nombre). */
export function normalizarFilaDrop(o: unknown): PublicacionLeidaDrop | null {
  if (!o || typeof o !== "object") return null;
  const f = o as Partial<Record<keyof FilaLeidaDrop, unknown>>;
  const dropId = texto(f.dropId, 40).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(dropId)) return null;
  const producto = texto(f.producto, 400);
  const codigo = /\bID-[A-Z0-9]{3,12}\b/.exec(producto)?.[0] ?? null;
  const nombre = (codigo ? producto.replace(codigo, "") : producto).replace(/\s+/g, " ").trim().slice(0, 300);
  if (!nombre) return null;
  return {
    dropId,
    codigo,
    nombre,
    skuDrop: texto(f.sku) || null,
    estado: /inactiv/i.test(texto(f.estado, 40)) ? "inactivo" : "activo",
    precio: leerPrecioDrop(texto(f.precio, 40)),
    inventario: leerInventarioDrop(texto(f.inventario, 40)),
    creadoEnDrop: leerFechaDrop(texto(f.creado, 60)),
    fotoUrl: fotoDeDrop(typeof f.foto === "string" ? f.foto : null),
    exclusivos: leerExclusivosDrop(f.exclusivos),
  };
}

/** Las filas de una lectura, revisadas y sin repetir (la misma publicación en dos páginas cuenta una vez). */
export function publicacionesDeLectura(productos: unknown): PublicacionLeidaDrop[] {
  if (!Array.isArray(productos)) return [];
  const m = new Map<string, PublicacionLeidaDrop>();
  for (const o of productos) {
    const p = normalizarFilaDrop(o);
    if (p && !m.has(p.dropId)) m.set(p.dropId, p);
  }
  return [...m.values()];
}

/** Para comparar nombres: sin tildes, en minúsculas y solo letras y números. */
export const nombreComparable = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * La utilidad y el margen de una publicación de Drop: precio − costo del producto − fulfillment de Drop, todo en colones. Sin precio o sin costo
 * no hay margen (null); sin fulfillment se calcula sin él.
 */
export function margenDrop(precio: number | null, costo: number | null, fulfillment: number | null): { utilidad: number; margen: number } | null {
  if (precio === null || costo === null || !(precio > 0)) return null;
  const utilidad = Math.round((precio - costo - (fulfillment ?? 0)) * 100) / 100;
  return { utilidad, margen: utilidad / precio };
}
