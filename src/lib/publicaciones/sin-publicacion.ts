// Gestión de IDs Dropi › «En Dropi sin publicación» (26 oct 2026, pedido de Alcides). Desde el 24 oct 2026 el sistema manda y la
// lectura de «Mis productos» ya no crea publicaciones: un producto que alguien publicó directo en Dropi quedaba sin publicación y nadie
// se enteraba. Esto lo calcula (sin base ni React, para probarlo): los productos activos de la última lectura que ninguna publicación
// del país tiene en su ID de Dropi, sin los servicios de Dropi (envío, seguro), y con qué publicación se parece cada uno (una
// republicación suele llevar el mismo nombre que la vieja).

import { palabrasClave, parecidoNombre } from "@/lib/wms/duplicados";
import { idsDeDropi, type ProductoProveedor } from "./sincronizar-dropi";

/** Desde cuánto del nombre se ofrece una publicación como «se parece» (la misma vara de Scraping para lo parecido). */
export const UMBRAL_PARECIDA = 0.6;
/** Cuántas publicaciones parecidas se ofrecen por producto. */
export const MAX_PARECIDAS = 3;

/** Lo que Dropi lista como producto pero es un servicio de despacho: «ENVÍO PRIORITARIO», «SEGURO DE DESPACHO». */
export function esServicioDropi(nombre: string): boolean {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /\b(envio|envios|seguro|seguros)\b/.test(n);
}

export interface PublicacionParaCruzar {
  id: string;
  numero: number | null;
  nombre: string;
  dropiId: string | null;
  archivada: boolean;
}

export interface Parecida {
  id: string;
  numero: number | null;
  nombre: string;
  dropiId: string | null;
  archivada: boolean;
  /** De 0 a 1: cuánto del nombre más corto está en el otro. */
  parecido: number;
}

export interface ProductoSinPublicacion {
  dropiId: number;
  nombre: string;
  privado: boolean;
  precio: number | null;
  stock: number;
  /** El ID de su bodega con más stock (81 = «B81»), o null si Dropi no lista ninguna (sin stock). */
  bodega: number | null;
  creado: string | null;
  parecidas: Parecida[];
}

/** Las palabras del nombre completo (las palabras clave quitan «PACK-2», «x2»…, que aquí sí cuentan para desempatar). */
const palabrasDe = (nombre: string) => nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).length;

/** Las publicaciones del país que más se parecen por nombre (las que siguen activas primero cuando se parecen igual). */
export function parecidasA(nombre: string, publicaciones: PublicacionParaCruzar[], limite = MAX_PARECIDAS): Parecida[] {
  const palabras = palabrasClave(nombre);
  if (!palabras.length) return [];
  const total = palabrasDe(nombre);
  const out: (Parecida & { sobran: number })[] = [];
  for (const p of publicaciones) {
    const otras = palabrasClave(p.nombre);
    if (!otras.length) continue;
    const parecido = parecidoNombre(palabras, otras);
    // Dos palabras en común (o todas, si el nombre más corto tiene una sola): «Crema» sola no hace parecidas a dos cremas.
    const comunes = Math.round(parecido * Math.min(palabras.length, otras.length));
    if (parecido < UMBRAL_PARECIDA || comunes < Math.min(2, palabras.length, otras.length)) continue;
    out.push({ id: p.id, numero: p.numero, nombre: p.nombre, dropiId: p.dropiId, archivada: p.archivada, parecido, sobran: Math.abs(palabrasDe(p.nombre) - total) });
  }
  // Si se parecen igual, primero la que no tiene palabras de más («Yerba Magic» antes que «Yerba Magic PACK-2»), luego las activas.
  return out
    .sort((a, b) => b.parecido - a.parecido || a.sobran - b.sobran || Number(a.archivada) - Number(b.archivada) || (b.numero ?? 0) - (a.numero ?? 0))
    .slice(0, limite)
    .map(({ sobran: _s, ...x }) => (void _s, x));
}

/**
 * Los productos activos de la última lectura de «Mis productos» que no están en el ID de Dropi de ninguna publicación del país
 * (archivadas incluidas: un ID viejo ya tiene su publicación), sin los servicios de Dropi. Los de más stock primero.
 */
export function enDropiSinPublicacion(productos: Iterable<ProductoProveedor>, publicaciones: PublicacionParaCruzar[]): ProductoSinPublicacion[] {
  const usados = new Set<number>();
  for (const p of publicaciones) for (const id of idsDeDropi(p.dropiId)) usados.add(id);
  const out: ProductoSinPublicacion[] = [];
  for (const p of productos) {
    if (p.archivado || usados.has(p.id) || esServicioDropi(p.nombre)) continue;
    const bodega = p.bodegas.length ? p.bodegas.reduce((a, b) => (b.stock > a.stock ? b : a)).id : null;
    out.push({ dropiId: p.id, nombre: p.nombre, privado: p.privado, precio: p.precio, stock: p.stock, bodega, creado: p.creado, parecidas: parecidasA(p.nombre, publicaciones) });
  }
  return out.sort((a, b) => b.stock - a.stock || b.dropiId - a.dropiId);
}
