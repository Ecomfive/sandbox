// Scraping de proveedores › la ficha de un proveedor referente (3 nov 2026, pedido de Hernán: «que ahí esté toda la información de ese
// proveedor: los productos que tienen ellos que no tenemos, la categoría top que manejan, toda la información que nos sirve»). De sus
// productos ya leídos (los de la lista de Scraping) saca sus categorías fuertes, lo que tienen y nosotros no, lo que más venden, lo nuevo,
// lo que ya tenemos de ellos y su rango de precios. Sin base ni React, con prueba.

import type { Recomendacion } from "./recomendar";

/** Lo justo de un producto del proveedor (un subconjunto de `FilaScraping`). */
export interface ProductoDeProveedor {
  id: string;
  nombre: string;
  foto: string | null;
  categoria: string | null;
  precio: number | null;
  precioUsd: number | null;
  stock: number | null;
  ventas30: number;
  ventas7: number;
  estado: "activo" | "desaparecido" | string;
  nuevo: boolean;
  recomendacion: Recomendacion;
  /** Lo nuestro que es igual (Test, Producto, Compras, publicaciones). */
  yaVisto: { nombre: string } | null;
  /** Lo nuestro que se parece sin ser igual, el más parecido primero. */
  parecidos: { nombre: string }[];
  /** Si alguien lo sacó de la lista con «Ya lo tenemos». */
  marcado: unknown | null;
}

/** Un producto en la ficha: con a qué se parece de lo nuestro, si algo. */
export type ProductoPerfil = Pick<ProductoDeProveedor, "id" | "nombre" | "foto" | "categoria" | "precio" | "precioUsd" | "stock" | "ventas30" | "recomendacion" | "nuevo"> & {
  /** Lo nuestro igual o parecido («Crema Tallow Honey Balm»), o `null`. */
  nuestro: string | null;
};

export interface CategoriaPerfil {
  nombre: string;
  productos: number;
  ventas30: number;
}

export interface PerfilProveedor {
  activos: number;
  desaparecidos: number;
  /** Stock total de lo que tiene publicado. */
  stock: number;
  ventas30: number;
  ventas7: number;
  /** Sus categorías, las que más venden primero (luego las de más productos). */
  categorias: CategoriaPerfil[];
  /** Lo que tiene publicado y nosotros no (ni igual en Test, Producto, Compras o publicaciones, ni marcado «Ya lo tenemos»). */
  noTenemos: ProductoPerfil[];
  noTenemosTotal: number;
  /** Lo que más vende (ventas estimadas de 30 días). */
  masVendidos: ProductoPerfil[];
  /** Lo que publicó hace menos de 14 días. */
  nuevos: ProductoPerfil[];
  nuevosTotal: number;
  /** Lo suyo que ya tenemos. */
  tenemos: ProductoPerfil[];
  tenemosTotal: number;
  /** Su precio más bajo, el del medio y el más alto (en la moneda del país y en dólares). */
  precios: { minimo: number; mediana: number; maximo: number; minimoUsd: number | null; medianaUsd: number | null; maximoUsd: number | null } | null;
}

/** Cuántos de cada lista se muestran en la ficha (el total se dice aparte). */
export const LIMITES_PERFIL = { categorias: 8, noTenemos: 40, masVendidos: 10, nuevos: 12, tenemos: 15 } as const;

const ORDEN_RECOMENDACION: Record<Recomendacion, number> = { testear: 0, mirar: 1, sin_senales: 2, tenemos: 3 };

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

const aPerfil = (p: ProductoDeProveedor): ProductoPerfil => ({
  id: p.id,
  nombre: p.nombre,
  foto: p.foto,
  categoria: p.categoria,
  precio: p.precio,
  precioUsd: p.precioUsd,
  stock: p.stock,
  ventas30: p.ventas30,
  recomendacion: p.recomendacion,
  nuevo: p.nuevo,
  nuestro: p.yaVisto?.nombre ?? p.parecidos[0]?.nombre ?? null,
});

/** Lo vendido primero; a igual venta, más stock (lo que tiene más empuje). */
const porVentas = (a: ProductoDeProveedor, b: ProductoDeProveedor) => b.ventas30 - a.ventas30 || b.ventas7 - a.ventas7 || (b.stock ?? 0) - (a.stock ?? 0);

/** El perfil de un proveedor con sus productos leídos. */
export function perfilProveedor(productos: ProductoDeProveedor[]): PerfilProveedor {
  const activos = productos.filter((p) => p.estado !== "desaparecido");
  const tenemos = (p: ProductoDeProveedor) => !!p.yaVisto || !!p.marcado || p.recomendacion === "tenemos";

  // Una fila puede traer varias categorías («Belleza, Salud»): cuenta en cada una.
  const cats = new Map<string, CategoriaPerfil>();
  for (const p of activos) {
    const nombres = (p.categoria ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    for (const nombre of nombres.length ? nombres : ["Sin categoría"]) {
      const c = cats.get(nombre) ?? { nombre, productos: 0, ventas30: 0 };
      c.productos++;
      c.ventas30 += p.ventas30;
      cats.set(nombre, c);
    }
  }

  const noTenemos = activos.filter((p) => !tenemos(p)).sort((a, b) => ORDEN_RECOMENDACION[a.recomendacion] - ORDEN_RECOMENDACION[b.recomendacion] || porVentas(a, b));
  const suyosTenemos = activos.filter(tenemos).sort(porVentas);
  const nuevos = activos.filter((p) => p.nuevo).sort(porVentas);
  const conPrecio = activos.filter((p) => p.precio !== null);
  const usd = conPrecio.map((p) => p.precioUsd).filter((x): x is number => x !== null);

  return {
    activos: activos.length,
    desaparecidos: productos.length - activos.length,
    stock: activos.reduce((t, p) => t + Math.max(0, p.stock ?? 0), 0),
    ventas30: activos.reduce((t, p) => t + p.ventas30, 0),
    ventas7: activos.reduce((t, p) => t + p.ventas7, 0),
    categorias: [...cats.values()].sort((a, b) => b.ventas30 - a.ventas30 || b.productos - a.productos).slice(0, LIMITES_PERFIL.categorias),
    noTenemos: noTenemos.slice(0, LIMITES_PERFIL.noTenemos).map(aPerfil),
    noTenemosTotal: noTenemos.length,
    masVendidos: activos.filter((p) => p.ventas30 > 0).sort(porVentas).slice(0, LIMITES_PERFIL.masVendidos).map(aPerfil),
    nuevos: nuevos.slice(0, LIMITES_PERFIL.nuevos).map(aPerfil),
    nuevosTotal: nuevos.length,
    tenemos: suyosTenemos.slice(0, LIMITES_PERFIL.tenemos).map(aPerfil),
    tenemosTotal: suyosTenemos.length,
    precios: conPrecio.length
      ? {
          minimo: Math.min(...conPrecio.map((p) => p.precio!)),
          mediana: mediana(conPrecio.map((p) => p.precio!)),
          maximo: Math.max(...conPrecio.map((p) => p.precio!)),
          minimoUsd: usd.length ? Math.min(...usd) : null,
          medianaUsd: usd.length ? mediana(usd) : null,
          maximoUsd: usd.length ? Math.max(...usd) : null,
        }
      : null,
  };
}
