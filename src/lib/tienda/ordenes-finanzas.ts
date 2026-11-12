// Gestión de tienda con las órdenes de Finanzas (11 nov 2026, pedido de Hernán: «la interfaz ya la tenemos, lo que falta es la información»).
// Mientras una tienda no está conectada a Shopify, sus pantallas (Pedidos, Dashboard, detalle) leen las órdenes que cargó Finanzas desde su Excel de
// gestión (`ven_ordenes` y `ven_orden_lineas`, Portal AF4): una sola tabla de órdenes para Finanzas y Tiendas, sin copiar nada. Solo se lee.
// Aquí, sin base ni React, cómo se traduce cada orden a lo que muestran las pantallas. Con prueba.

import type { EstadoPedido, Vendido } from "./resumen";

/**
 * El estado de un pedido a partir del estado de entrega del Excel de Finanzas y sus etiquetas de Shopify. Igual que el ciclo de Finanzas
 * (`faseInicial`, src/lib/ventas/ciclo.ts): «no gestionada» es una orden que nunca se trabajó y cuenta como cancelada. Una pendiente con la etiqueta
 * «Confirmada» ya se confirmó; sin ella, sigue por confirmar.
 */
export function estadoDesdeFinanzas(estadoEntrega: string | null, etiquetas: string | null): EstadoPedido {
  switch (estadoEntrega) {
    case "entregada":
      return "entregado";
    case "en_transito":
      return "en_camino";
    case "devuelta":
      return "devuelto";
    case "cancelada":
    case "no_gestionada":
      return "cancelado";
    default:
      return etiquetasDe(etiquetas).some((e) => /^confirmad[ao]$/i.test(e)) ? "confirmado" : "nuevo";
  }
}

/** Las etiquetas de Shopify de una orden («CIUDAD, Confirmada, easysell_cod_form»), sin espacios de más. */
export function etiquetasDe(etiquetas: string | null): string[] {
  return (etiquetas ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** La zona que dicen las etiquetas: «CIUDAD» o «INTERIOR» (también «INTERIOR/SERVIENTREGA»). Null si no dicen. */
export function zonaDeEtiquetas(etiquetas: string | null): string | null {
  for (const e of etiquetasDe(etiquetas)) {
    const n = e.toUpperCase();
    if (n === "CIUDAD" || n.startsWith("CIUDAD/")) return "Ciudad";
    if (n === "INTERIOR" || n.startsWith("INTERIOR/")) return "Interior";
  }
  return null;
}

/** La fecha del Excel (solo el día, AAAA-MM-DD) como momento: el mediodía de Panamá, para que caiga en el mismo día en cualquier cuenta. */
export const momentoDeFecha = (fecha: string) => `${fecha}T17:00:00.000Z`;

/** El nombre de una tienda del sistema frente al de su unidad en Finanzas («Kenku» y «KENKU»): sin acentos, mayúsculas ni espacios de más. */
export const nombreComparable = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

export interface LineaFinanzas {
  pedidoId: string;
  titulo: string;
  skuId: string | null;
  cantidad: number;
  /** El precio de la línea; el Excel casi nunca lo trae. */
  precio: number | null;
  esServicio: boolean;
}

/**
 * Lo vendido por producto con las líneas de Finanzas: por el producto nuestro si la línea está vinculada y, si no, por el nombre del producto en la
 * orden. Lo cancelado y los servicios (envío, seguro) no cuentan. Como el Excel no trae el precio de cada línea, el ingreso de una línea sin precio es
 * el total de su pedido repartido por unidades entre sus líneas. De más a menos ingreso.
 */
export function vendidosDeFinanzas(lineas: LineaFinanzas[], pedidos: Map<string, { estado: EstadoPedido; total: number }>): (Vendido & { titulo: string })[] {
  const unidadesDe = new Map<string, number>();
  for (const l of lineas) if (!l.esServicio) unidadesDe.set(l.pedidoId, (unidadesDe.get(l.pedidoId) ?? 0) + l.cantidad);
  const grupos = new Map<string, { skuId: string | null; titulo: string; unidades: number; pedidos: Set<string>; ingreso: number }>();
  let total = 0;
  for (const l of lineas) {
    const p = pedidos.get(l.pedidoId);
    if (!p || p.estado === "cancelado" || l.esServicio) continue;
    const clave = l.skuId ?? `t:${nombreComparable(l.titulo)}`;
    const g = grupos.get(clave) ?? { skuId: l.skuId, titulo: l.titulo, unidades: 0, pedidos: new Set<string>(), ingreso: 0 };
    const ingreso = l.precio !== null ? l.precio * l.cantidad : (p.total * l.cantidad) / Math.max(1, unidadesDe.get(l.pedidoId) ?? 1);
    g.unidades += l.cantidad;
    g.pedidos.add(l.pedidoId);
    g.ingreso += ingreso;
    total += ingreso;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      skuId: g.skuId,
      titulo: g.titulo,
      unidades: g.unidades,
      pedidos: g.pedidos.size,
      ingreso: Math.round(g.ingreso * 100) / 100,
      porcentaje: total > 0 ? Math.round((g.ingreso / total) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.ingreso - a.ingreso);
}
