// Ventas Proveeduría con Drop y Effi (9 nov 2026, pedido de Hernán: «ya tenemos conectado Drop y Effi Costa Rica pero en ventas aún no me salen los datos»). Sus ventas
// están en `plataforma_ventas_diarias` (migración 0244: salidas y devueltas por artículo y día) con el id de la plataforma, que en Drop es un texto. Aquí se pasan a la
// misma forma que las de Dropi (`ProductoDropi` y `VentaDia`, con un número propio por artículo) para usar el mismo tablero, y en «Todas» se juntan por producto del
// sistema. Sin base ni React, con prueba.

import type { ProductoDropi, VentaDia } from "./ventas";

export type PlataformaVentas = "drop" | "effi" | "dunamixfy";

export const NOMBRE_PLATAFORMA_VENTAS: Record<PlataformaVentas | "dropi", string> = { dropi: "Dropi", drop: "Drop", effi: "Effi", dunamixfy: "Dunamixfy" };

/** Desde dónde se numeran los artículos de cada plataforma: muy por encima de los IDs de Dropi (6 cifras), para que en «Todas» no choquen. */
const BASE: Record<PlataformaVentas, number> = { drop: 10_000_000, effi: 20_000_000, dunamixfy: 30_000_000 };

export interface PublicacionPlataforma {
  /** El id del artículo en la plataforma (`drop_id`, `effi_id`). */
  idPlataforma: string;
  nombre: string;
  /** Lo que se muestra como su ID: el código de Drop o el id de Effi. */
  etiqueta: string;
  stock: number;
  activa: boolean;
  sku: { codigo: string; nombre: string; numero: number | null; barras: string | null } | null;
}

export interface VentaPlataformaDia {
  producto: string;
  dia: string;
  salidas: number;
  devueltas: number;
}

export interface VentasDePlataforma {
  productos: ProductoDropi[];
  dias: VentaDia[];
  /** El texto del ID de cada artículo («Drop · ABC-1»). */
  etiquetaDe: Map<number, string>;
  /** El producto del sistema de cada artículo, si está vinculado. */
  skuDe: Map<number, NonNullable<PublicacionPlataforma["sku"]>>;
  /** El último día con ventas (AAAA-MM-DD), o null si no hay ninguna. */
  ultimoDia: string | null;
}

/**
 * Las ventas de una plataforma en la forma del tablero: cada artículo con un número propio y sus días. Salió = pedida; lo devuelto se resta, así que netas = salidas −
 * devueltas (Drop y Effi no dicen cancelaciones ni rechazos). Un artículo que vendió pero ya no está en las publicaciones sale igual, con su id como nombre.
 */
export function armarVentasPlataforma(plataforma: PlataformaVentas, publicaciones: PublicacionPlataforma[], ventas: VentaPlataformaDia[]): VentasDePlataforma {
  const nombre = NOMBRE_PLATAFORMA_VENTAS[plataforma];
  const numeroDe = new Map<string, number>();
  const etiquetaDe = new Map<number, string>();
  const skuDe = new Map<number, NonNullable<PublicacionPlataforma["sku"]>>();
  const productos: ProductoDropi[] = [];
  const nuevo = (id: string, p: Pick<PublicacionPlataforma, "nombre" | "etiqueta" | "stock" | "activa" | "sku">) => {
    const n = BASE[plataforma] + numeroDe.size + 1;
    numeroDe.set(id, n);
    etiquetaDe.set(n, `${nombre} · ${p.etiqueta}`);
    if (p.sku) skuDe.set(n, p.sku);
    productos.push({ id: n, nombre: p.nombre, lista: p.activa ? "activo" : "archivado", privado: false, variable: false, stock: Math.max(0, p.stock), primeraVenta: null, ultimaVenta: null });
    return n;
  };
  for (const p of publicaciones) if (!numeroDe.has(p.idPlataforma)) nuevo(p.idPlataforma, p);

  const dias: VentaDia[] = [];
  let ultimoDia: string | null = null;
  for (const v of ventas) {
    if (v.salidas <= 0 && v.devueltas <= 0) continue;
    const n = numeroDe.get(v.producto) ?? nuevo(v.producto, { nombre: `Artículo ${v.producto}`, etiqueta: v.producto, stock: 0, activa: false, sku: null });
    dias.push({ producto: n, dia: v.dia, pedidas: v.salidas, ordenes: v.salidas, canceladas: 0, rechazadas: 0, devueltas: v.devueltas });
    if (!ultimoDia || v.dia > ultimoDia) ultimoDia = v.dia;
  }
  // La primera y la última venta de cada artículo, de sus salidas.
  const porProducto = new Map(productos.map((p) => [p.id, p]));
  for (const d of dias) {
    if (d.pedidas <= 0) continue;
    const p = porProducto.get(d.producto)!;
    if (!p.primeraVenta || d.dia < p.primeraVenta) p.primeraVenta = d.dia;
    if (!p.ultimaVenta || d.dia > p.ultimaVenta) p.ultimaVenta = d.dia;
  }
  return { productos, dias, etiquetaDe, skuDe, ultimoDia };
}

/** «Drop · ABC-1» o, si una fila junta varios artículos, todos separados por coma. */
export function textoEtiquetas(ids: number[], etiquetaDe: Map<number, string>): string {
  return ids.map((id) => etiquetaDe.get(id) ?? `Dropi · ID ${id}`).join(", ");
}

/**
 * Lo vendido por un producto en una plataforma (Drop, Effi, Dunamixfy) para su ficha (12 nov 2026, pedido de Hernán: «mostrar las ventas por plataforma en las fichas de los
 * productos»): netas (salidas − devueltas) de los últimos 30 días hasta `corte` (el último día leído de esa plataforma en el país) y en total, con la primera y la última venta.
 */
export function resumenVentasPlataforma(ventas: readonly Pick<VentaPlataformaDia, "dia" | "salidas" | "devueltas">[], corte: string | null): { netas30: number; netasTotal: number; primeraVenta: string | null; ultimaVenta: string | null } {
  const desde = corte ? new Date(Date.parse(`${corte}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10) : null;
  let netas30 = 0;
  let netasTotal = 0;
  let primeraVenta: string | null = null;
  let ultimaVenta: string | null = null;
  for (const v of ventas) {
    const netas = v.salidas - v.devueltas;
    netasTotal += netas;
    if (desde && v.dia >= desde && v.dia <= corte!) netas30 += netas;
    if (v.salidas > 0) {
      if (!primeraVenta || v.dia < primeraVenta) primeraVenta = v.dia;
      if (!ultimaVenta || v.dia > ultimaVenta) ultimaVenta = v.dia;
    }
  }
  return { netas30, netasTotal, primeraVenta, ultimaVenta };
}
