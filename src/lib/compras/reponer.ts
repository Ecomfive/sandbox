// Compras › Reponer: qué comprar según lo que se vende en Dropi (Desempeño › Ventas Dropi). Lógica pura, sin base ni React.
//
// Un producto del sistema puede estar publicado varias veces en Dropi (pública y privadas): se suman sus ventas y su stock, porque
// la compra es una sola. Lo que ya viene en compras abiertas se descuenta de lo sugerido.

import { DIAS_REPONER, type ResumenProducto } from "@/lib/publicaciones/ventas";

/** Para cuántos días de venta se sugiere comprar (se puede cambiar en la página). */
export const DIAS_COBERTURA = 60;
export const COBERTURAS = [30, 60, 90] as const;

/** Las unidades de un SKU que vienen en compras abiertas. */
export interface EnCamino {
  unidades: number;
  /** Las compras que las traen, de la que llega antes a la que llega después. */
  compras: { numero: string; etapa: string; unidades: number; planificacion: string | null }[];
}

export interface FilaReponer {
  /** El SKU del sistema; `null` si sus publicaciones de Dropi no están vinculadas (no se puede comprar desde aquí). */
  sku: { id: string; codigo: string; nombre: string } | null;
  /** El nombre a mostrar: el del SKU, o el del producto de Dropi si no está vinculado. */
  nombre: string;
  /** Los productos de Dropi que suma. */
  dropiIds: number[];
  netas30: number;
  porDia: number;
  stock: number;
  diasInventario: number | null;
  enCamino: EnCamino;
  /** Unidades a comprar para cubrir la cobertura: venta por día × días − stock − en camino (nunca menos de 0). */
  sugerido: number;
}

/**
 * Las filas para reponer: cada SKU (sumando sus productos de Dropi) o cada producto de Dropi sin vincular que se vende y no tiene
 * stock o le alcanza para menos de 15 días. Ordenadas de las que antes se quedan sin stock a las que después.
 */
export function filasReponer(
  resumen: ResumenProducto[],
  skuDe: Map<number, { id: string; codigo: string; nombre: string }>,
  enCamino: Map<string, EnCamino>,
  dias: number = DIAS_COBERTURA,
): FilaReponer[] {
  const grupos = new Map<string, { sku: FilaReponer["sku"]; nombre: string; productos: ResumenProducto[] }>();
  for (const r of resumen) {
    const sku = skuDe.get(r.id) ?? null;
    const clave = sku ? `sku:${sku.id}` : `dropi:${r.id}`;
    const g = grupos.get(clave) ?? { sku, nombre: sku?.nombre ?? r.nombre, productos: [] };
    g.productos.push(r);
    grupos.set(clave, g);
  }
  const filas: FilaReponer[] = [];
  for (const g of grupos.values()) {
    const netas30 = g.productos.reduce((a, r) => a + r.netas30, 0);
    if (netas30 <= 0) continue;
    const stock = g.productos.reduce((a, r) => a + Math.max(r.stock, 0), 0);
    const porDia = netas30 / 30;
    const diasInventario = Math.round(stock / porDia);
    if (stock > 0 && diasInventario >= DIAS_REPONER) continue;
    const camino = (g.sku && enCamino.get(g.sku.codigo)) || { unidades: 0, compras: [] };
    filas.push({
      sku: g.sku,
      nombre: g.nombre,
      dropiIds: g.productos.map((r) => r.id).sort((a, b) => a - b),
      netas30,
      porDia,
      stock,
      diasInventario,
      enCamino: camino,
      sugerido: Math.max(0, Math.ceil(porDia * dias - stock - camino.unidades)),
    });
  }
  return filas.sort((a, b) => (a.diasInventario ?? 0) - (b.diasInventario ?? 0) || b.netas30 - a.netas30);
}

/** Etapas de una compra que todavía no llegó (las que se cuentan como «en camino»). */
export const ETAPAS_EN_CAMINO = ["cotizar", "cotizado", "produccion", "tracking", "arribo_mercancia"];

/**
 * Suma lo que viene en compras abiertas de un país, por código de SKU. Cada compra trae sus líneas (código y cantidad), su etapa
 * y su planificación (cuándo llega).
 */
export function unidadesEnCamino(
  compras: { numero: string; etapa: string; etiquetaEtapa: string; anulada: boolean; planificacion: string | null; lineas: { codigo: string; cantidad: number }[] }[],
): Map<string, EnCamino> {
  const m = new Map<string, EnCamino>();
  for (const c of compras) {
    if (c.anulada || !ETAPAS_EN_CAMINO.includes(c.etapa)) continue;
    for (const l of c.lineas) {
      if (l.cantidad <= 0) continue;
      const x = m.get(l.codigo) ?? { unidades: 0, compras: [] };
      x.unidades += l.cantidad;
      x.compras.push({ numero: c.numero, etapa: c.etiquetaEtapa, unidades: l.cantidad, planificacion: c.planificacion });
      m.set(l.codigo, x);
    }
  }
  // La que más avanzó primero (la etapa más avanzada llega antes).
  for (const x of m.values()) x.compras.sort((a, b) => b.etapa.localeCompare(a.etapa));
  return m;
}
