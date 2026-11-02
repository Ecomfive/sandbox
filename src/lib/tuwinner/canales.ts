// «Se repite en varios canales» de Tu Winner (2 nov 2026): junta los ganadores de Panamá y México que son el mismo producto (por su SKU si lo tenemos, si
// no por el nombre) y cuenta en cuántas otras fuentes del Testing Lab aparece cada uno (competencia de Dropi, Scraping de proveedores, Biblioteca de
// anuncios, Sugerencias de clientes). El nombre se compara como «ya visto» de Testing Lab: 85 % de las palabras del nombre más corto y al menos 2 en común.
// Sin base ni React: lo usan el panel y las pruebas.

import { palabrasClave, parecidoNombre } from "@/lib/wms/duplicados";
import type { PaisTuWinner } from "./tuwinner";

export const UMBRAL_MISMO = 0.85;

const mismoNombre = (a: string[], b: string[]): boolean => {
  const p = parecidoNombre(a, b);
  return p >= UMBRAL_MISMO && Math.round(p * Math.min(a.length, b.length)) >= 2;
};

export interface GanadorParaAgrupar {
  pais: PaisTuWinner;
  dropiId: string;
  nombre: string;
  ventas7: number;
  /** El producto nuestro al que corresponde, si se sabe. */
  skuId: string | null;
}

export interface Grupo {
  clave: string;
  /** El nombre que se muestra: el del que más vende. */
  nombre: string;
  skuId: string | null;
  ventas: Record<PaisTuWinner, number>;
  miembros: GanadorParaAgrupar[];
}

/** Junta los ganadores que son el mismo producto: mismo SKU nuestro o el mismo nombre. El que más vende da el nombre del grupo. */
export function agruparGanadores(items: readonly GanadorParaAgrupar[]): Grupo[] {
  const grupos: (Grupo & { palabras: string[] })[] = [];
  for (const it of [...items].sort((a, b) => b.ventas7 - a.ventas7)) {
    const palabras = palabrasClave(it.nombre);
    const g = grupos.find((x) => (it.skuId && x.skuId === it.skuId) || (palabras.length >= 2 && x.palabras.length >= 2 && (!it.skuId || !x.skuId) && mismoNombre(palabras, x.palabras)));
    if (g) {
      g.miembros.push(it);
      g.ventas[it.pais] += it.ventas7;
      if (!g.skuId && it.skuId) g.skuId = it.skuId;
    } else
      grupos.push({ clave: it.skuId ? `sku:${it.skuId}` : `${it.pais}:${it.dropiId}`, nombre: it.nombre, skuId: it.skuId, ventas: { PA: it.pais === "PA" ? it.ventas7 : 0, MX: it.pais === "MX" ? it.ventas7 : 0 }, miembros: [it], palabras });
  }
  return grupos.map(({ palabras: _p, ...g }) => {
    void _p;
    return g;
  });
}

/**
 * Cuántos textos de una fuente nombran cada producto (cada texto cuenta una vez por producto). Un texto largo (el de un anuncio) cuenta si trae casi todas
 * las palabras del nombre. Productos de una sola palabra no se cuentan: una palabra suelta no dice qué producto es.
 */
export function contarMenciones(productos: readonly { clave: string; nombre: string }[], textos: readonly string[]): Map<string, number> {
  const idx = productos.map((p) => ({ clave: p.clave, palabras: palabrasClave(p.nombre) })).filter((p) => p.palabras.length >= 2);
  const porPalabra = new Map<string, number[]>();
  idx.forEach((p, i) => p.palabras.forEach((w) => porPalabra.set(w, [...(porPalabra.get(w) ?? []), i])));
  const cuenta = new Map<string, number>();
  for (const t of textos) {
    const pw = palabrasClave(t);
    const candidatos = new Set<number>();
    for (const w of pw) for (const i of porPalabra.get(w) ?? []) candidatos.add(i);
    const contados = new Set<string>();
    for (const i of candidatos) {
      const p = idx[i];
      if (contados.has(p.clave) || !mismoNombre(p.palabras, pw)) continue;
      contados.add(p.clave);
      cuenta.set(p.clave, (cuenta.get(p.clave) ?? 0) + 1);
    }
  }
  return cuenta;
}
