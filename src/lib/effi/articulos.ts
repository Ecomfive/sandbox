// Gestión de IDs Effi › lee un artículo tal como lo devuelve `GET /api/articulo` (5 nov 2026; la forma está en la documentación de Effi, dentro de la cuenta).
// Solo cuenta el stock de nuestras bodegas: las que tienen nombre de tienda (Conecta Shop, PuraOfertas…) son las que se le crean a cada dropshipper y no se tocan
// en el sistema. Por eso no se usa `stock_empresa`, que las suma todas. Sin base ni React, con prueba.

export interface ArticuloEffi {
  effiId: string;
  nombre: string;
  referencia: string | null;
  gtin: string | null;
  categoria: string | null;
  fotoUrl: string | null;
  precioDropshipping: number | null;
  precioSugerido: number | null;
  precioMinimo: number | null;
  costo: number | null;
  stockPrincipal: number | null;
  stockGarantias: number | null;
  /** Compartido con los distribuidores de dropshipping. */
  compartido: boolean;
}

const texto = (v: unknown, max = 300): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s.slice(0, max) : null;
};

export const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Un monto de Effi: «5449.0000», «5,449», «₡5,449» o un número. `null` si no se entiende o es negativo. */
export function montoEffi(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  const limpio = v.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** «Dropshipping: 5449; Sugerida: 19000; Garantías: 0» (también separadas por salto de línea o `<br>`) → cada tarifa, con su nombre sin tildes y en minúsculas. */
export function tarifasEffi(v: unknown): Map<string, number> {
  const m = new Map<string, number>();
  if (typeof v !== "string") return m;
  for (const parte of v.split(/;|<br\s*\/?>|<hr[^>]*>|\n/i)) {
    const i = parte.lastIndexOf(":");
    if (i <= 0) continue;
    const monto = montoEffi(parte.slice(i + 1));
    if (monto !== null) m.set(sinTildes(parte.slice(0, i)), monto);
  }
  return m;
}

/** El monto de la tarifa cuyo nombre lleva esa palabra: la cuenta puede llamarla «Dropshipping» o «Tarifa Dropshipping». */
const tarifaCon = (tarifas: Map<string, number>, palabra: string): number | null => [...tarifas].find(([nombre]) => nombre.includes(palabra))?.[1] ?? null;

/** El stock de una de nuestras bodegas en `stock_bodegas`; `null` si Effi no la lista (combos, servicios o sin registro). */
function stockDeBodega(bodegas: unknown, nombre: string): number | null {
  if (!Array.isArray(bodegas)) return null;
  const lista = (bodegas as { nombre_bodega?: unknown; stock?: unknown }[]).filter((b) => typeof b?.nombre_bodega === "string" && sinTildes(b.nombre_bodega) === nombre);
  if (!lista.length) return null;
  return Math.round(lista.reduce((s, b) => s + (montoEffi(b.stock) ?? 0), 0));
}

const costoReal = (o: Record<string, unknown>): number | null => {
  // El último costo de compra, como `coste_real` en Gestión de IDs Dropi; si no hay, el manual.
  for (const c of [o.p_costo_ultimo, o.p_costo]) {
    const n = montoEffi(c);
    if (n !== null && n > 0) return n;
  }
  return null;
};

/** Un artículo de la API, sin confiar en la forma. `null` si no trae ID o nombre. */
export function normalizarArticulo(o: unknown): ArticuloEffi | null {
  if (!o || typeof o !== "object") return null;
  const a = o as Record<string, unknown>;
  const effiId = texto(a.id, 20);
  const nombre = texto(a.descripcion);
  if (!effiId || !/^[0-9]+$/.test(effiId) || !nombre) return null;
  const tarifas = tarifasEffi(a.precios_venta);
  const url = texto(a.url_foto, 1000);
  return {
    effiId,
    nombre,
    referencia: texto(a.referencia),
    gtin: texto(a.gtin, 64),
    categoria: texto(a.nombre_categoria_dropshipping) ?? texto(a.nombre_categoria),
    fotoUrl: url && /^https:\/\//.test(url) ? url : null,
    precioDropshipping: tarifaCon(tarifas, "dropshipping"),
    precioSugerido: tarifaCon(tarifas, "sugerid"),
    precioMinimo: montoEffi(a.p_min_venta),
    costo: costoReal(a),
    stockPrincipal: stockDeBodega(a.stock_bodegas, "principal"),
    stockGarantias: stockDeBodega(a.stock_bodegas, "garantias"),
    compartido: String(a.dropshipping ?? a.dropshipping_proveedor ?? "0") === "1",
  };
}

/** Los artículos de una lectura, revisados y sin repetir. */
export function articulosDeLectura(filas: unknown): ArticuloEffi[] {
  if (!Array.isArray(filas)) return [];
  const m = new Map<string, ArticuloEffi>();
  for (const o of filas) {
    const a = normalizarArticulo(o);
    if (a && !m.has(a.effiId)) m.set(a.effiId, a);
  }
  return [...m.values()];
}

/** Utilidad y margen: precio de dropshipping − costo − fulfillment de Effi. Sin precio o sin costo no hay margen; sin fulfillment se calcula sin él. */
export function margenEffi(precio: number | null, costo: number | null, fulfillment: number | null): { utilidad: number; margen: number } | null {
  if (precio === null || costo === null || !(precio > 0)) return null;
  const utilidad = Math.round((precio - costo - (fulfillment ?? 0)) * 100) / 100;
  return { utilidad, margen: utilidad / precio };
}
