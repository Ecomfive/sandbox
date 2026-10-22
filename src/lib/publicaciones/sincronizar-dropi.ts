// Gestión de IDs Dropi › Bodegas (pedido de Hernán, 22 oct 2026): Dropi manda. La lectura de «Mis productos» del proveedor
// (activos y archivados, con la bodega y el stock de cada uno) pone en cada publicación la ubicación, el precio, el tipo y el
// estado que dice Dropi. Sin base ni React, con prueba. La lectura la hace scripts/scraping-proveedores-navegador.js ›
// leerNuestrosProductos y la guarda scripts/publicaciones-sincronizar-dropi.ts (migración 0131).

export interface BodegaDropi {
  id: number;
  nombre: string;
  stock: number;
}

/** Un producto nuestro tal como lo ve ECOMFIVE en Dropi como proveedor. */
export interface ProductoProveedor {
  id: number;
  nombre: string;
  tipo: string | null;
  archivado: boolean;
  privado: boolean;
  precio: number | null;
  precioSugerido: number | null;
  stock: number;
  stockPrivado: number;
  bodegas: BodegaDropi[];
  categorias: string[];
  fotos: number;
  creado: string | null;
}

const numero = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const entero = (v: unknown) => Math.max(0, Math.round(numero(v) ?? 0));

/**
 * Un producto de la lectura de «Mis productos» (`bff/catalog/products/produit/<id>/owner`), sin confiar en la forma: las bodegas
 * de las variaciones se suman por bodega. `null` si no trae ID o nombre.
 */
export function normalizarProductoProveedor(o: Record<string, unknown>, archivado: boolean): ProductoProveedor | null {
  const id = numero(o.id);
  const nombre = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !nombre) return null;
  const porBodega = new Map<number, BodegaDropi>();
  const lista = [...(Array.isArray(o.warehouses) ? o.warehouses : []), ...(Array.isArray(o.variation_warehouses) ? o.variation_warehouses : [])] as Record<string, unknown>[];
  for (const w of lista) {
    const bid = numero(w?.id);
    if (!bid) continue;
    const b = porBodega.get(bid) ?? { id: bid, nombre: typeof w.name === "string" && w.name.trim() ? w.name.trim() : `Bodega ${bid}`, stock: 0 };
    b.stock += entero(w.stock);
    porBodega.set(bid, b);
  }
  const bodegas = [...porBodega.values()];
  return {
    id,
    nombre,
    tipo: typeof o.type === "string" ? o.type : null,
    archivado,
    privado: !!o.private_product,
    precio: numero(o.sale_price),
    precioSugerido: numero(o.suggested_price),
    stock: numero(o.total_stock) !== null ? entero(o.total_stock) : bodegas.reduce((s, b) => s + b.stock, 0),
    stockPrivado: entero(o.private_stock),
    bodegas,
    categorias: (Array.isArray(o.categories) ? o.categories : []).map((c) => (c as { name?: unknown })?.name).filter((n): n is string => typeof n === "string" && !!n.trim()),
    fotos: Array.isArray(o.gallery) ? o.gallery.length : 0,
    creado: typeof o.created_at === "string" ? o.created_at : null,
  };
}

/** La ubicación de Gestión de IDs que corresponde a una bodega de Dropi, por su nombre («Bodega Dropi Panama» → bodega_dropi). */
export function ubicacionDeBodega(nombre: string): string | null {
  const n = nombre.toLowerCase();
  if (n.includes("ecomfive")) return "bodega_ecomfive";
  if (n.includes("effi")) return "bodega_effi";
  if (n.includes("boxful")) return "boxful";
  if (n.includes("marketfull")) return "marketfull";
  if (n.includes("dunamix")) return "dunamixfy";
  if (n.includes("dropi")) return "bodega_dropi";
  return null;
}

/** Dónde está un producto: la bodega con más stock (sin stock en ninguna, la primera que lista Dropi); sin bodegas, null. */
export function ubicacionDeProducto(p: Pick<ProductoProveedor, "bodegas">): string | null {
  if (!p.bodegas.length) return null;
  const mayor = p.bodegas.reduce((a, b) => (b.stock > a.stock ? b : a));
  return ubicacionDeBodega(mayor.nombre);
}

/**
 * El producto de Dropi que manda en una publicación (puede tener dos IDs, «8165/7409»): el activo; entre activos, el de más
 * stock; si ninguno está activo, el primero que exista. `null` si ninguno está entre nuestros productos de Dropi.
 */
export function productoPrincipal(ids: number[], productos: Map<number, ProductoProveedor>): ProductoProveedor | null {
  const encontrados = ids.map((id) => productos.get(id)).filter((p): p is ProductoProveedor => !!p);
  if (!encontrados.length) return null;
  const activos = encontrados.filter((p) => !p.archivado);
  if (!activos.length) return encontrados[0];
  return activos.reduce((a, b) => (b.stock > a.stock ? b : a));
}

/** Los IDs de Dropi escritos en una publicación («7231-7679», «8165/7409»). */
export const idsDeDropi = (dropiId: string | null | undefined): number[] => (String(dropiId ?? "").match(/\d{3,6}/g) ?? []).map(Number);

export interface CambiosPublicacion {
  ubicacion?: string;
  precio_venta?: number;
  ultimo_cambio_precio?: string;
  tipo_publicacion?: "publico" | "privado";
  estado_publicacion?: "activo" | "archivado";
}

const ETIQUETA_UBICACION: Record<string, string> = {
  bodega_dropi: "Bodega Dropi",
  bodega_ecomfive: "Bodega Ecomfive",
  marketfull: "Marketfull",
  boxful: "Boxful",
  bodega_effi: "Bodega Effi",
  dunamixfy: "DunamixFY",
};
const usd = (n: number | null) => (n === null ? "sin precio" : `$${n.toFixed(2)}`);
const nombreUbicacion = (u: string | null) => (u ? (ETIQUETA_UBICACION[u] ?? u) : "sin anotar");

/**
 * Lo que hay que cambiar en una publicación para que diga lo mismo que Dropi, y cada cambio en palabras para la actividad. Un
 * producto archivado sin bodegas no cambia la ubicación (Dropi ya no la dice). Si cambia el precio, el último cambio de precio pasa a hoy.
 */
export function cambiosDesdeDropi(
  pub: { ubicacion: string | null; precioVenta: number | null; tipo: string | null; estadoPublicacion: string | null },
  p: ProductoProveedor,
  hoy: string,
): { cambios: CambiosPublicacion; detalle: string[] } {
  const cambios: CambiosPublicacion = {};
  const detalle: string[] = [];
  const ubicacion = ubicacionDeProducto(p);
  if (ubicacion && ubicacion !== pub.ubicacion) {
    cambios.ubicacion = ubicacion;
    detalle.push(`Dónde está: ${nombreUbicacion(pub.ubicacion)} → ${nombreUbicacion(ubicacion)}`);
  }
  if (p.precio !== null && (pub.precioVenta === null || Math.abs(pub.precioVenta - p.precio) > 0.005)) {
    cambios.precio_venta = p.precio;
    cambios.ultimo_cambio_precio = hoy;
    detalle.push(`Precio: ${usd(pub.precioVenta)} → ${usd(p.precio)}`);
  }
  const tipo = p.privado ? "privado" : "publico";
  if (tipo !== pub.tipo) {
    cambios.tipo_publicacion = tipo;
    detalle.push(`Tipo: ${pub.tipo === "privado" ? "Privado" : pub.tipo === "publico" ? "Público" : "sin anotar"} → ${tipo === "privado" ? "Privado" : "Público"}`);
  }
  const estado = p.archivado ? "archivado" : "activo";
  if (estado !== pub.estadoPublicacion) {
    cambios.estado_publicacion = estado;
    detalle.push(`En Dropi: ${pub.estadoPublicacion ?? "sin anotar"} → ${estado}`);
  }
  return { cambios, detalle };
}
