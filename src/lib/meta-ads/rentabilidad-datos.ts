// Anuncios Meta › la venta y el costo de cada producto de las campañas, desde los pedidos de la tienda y Compras (27 nov 2026, pedido de Hernán). Solo lee. La cuenta es de `rentabilidad.ts`.
//
// Se usan los pedidos **entregados** de un solo producto (así el total del pedido es lo que de verdad se cobró por ese producto). Un combo («PACK 2», «2x1») se cuenta con las unidades de sus componentes; si no tiene componentes
// cargados, por su nombre (un 2x1 = 2). El costo por unidad es el promedio de Compras del producto suelto (`costosDeProductos`, el mismo de Gestión de tienda); si no hay, el costo de la Matriz de esa línea.

import type { SupabaseClient } from "@supabase/supabase-js";
import { costosDeProductos } from "@/lib/tienda/costos";
import { economiaDe, unidadesPorNombre, type EconomiaProducto, type FuenteCosto, type PedidoEconomia } from "./rentabilidad";

/** Una línea de pedido, como la lee el análisis. */
export interface LineaVenta {
  orden: string;
  producto: string;
  cantidad: number;
  servicio: boolean;
  sku: string | null;
  costoMatriz: number | null;
  total: number | null;
  /** El pedido se entregó (solo esos dicen lo que de verdad se cobró). */
  entregado: boolean;
}

const trozos = <T>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

/** La venta y el costo de cada producto de las campañas. `claveDe` dice de qué producto de las campañas es una línea (por su nombre); null si de ninguno. Nunca lanza: lo que falla queda sin costo. */
export async function economiaDeProductos(supabase: SupabaseClient, paisId: string, lineas: readonly LineaVenta[], claveDe: (producto: string) => string | null): Promise<EconomiaProducto[]> {
  // Los pedidos entregados de un solo producto.
  const porOrden = new Map<string, LineaVenta[]>();
  for (const l of lineas) if (!l.servicio && l.producto && l.entregado) porOrden.set(l.orden, [...(porOrden.get(l.orden) ?? []), l]);
  const solos: (LineaVenta & { clave: string })[] = [];
  for (const ls of porOrden.values()) {
    if (ls.length !== 1 || !ls[0].total || ls[0].total <= 0) continue;
    const clave = claveDe(ls[0].producto);
    if (clave) solos.push({ ...ls[0], clave });
  }
  if (!solos.length) return [];

  // Combos: cuántas unidades de qué producto suelto trae cada uno.
  const skus = [...new Set(solos.map((l) => l.sku).filter((s): s is string => !!s))];
  const tipo = new Map<string, string>();
  const componentes = new Map<string, { id: string; cantidad: number }[]>();
  try {
    for (const parte of trozos(skus, 150)) {
      const { data } = await supabase.from("skus_maestros").select("id, tipo").in("id", parte);
      for (const s of data ?? []) tipo.set(String(s.id), String(s.tipo ?? ""));
    }
    const combos = skus.filter((s) => tipo.get(s) === "combo" || tipo.get(s) === "compuesto");
    for (const parte of trozos(combos, 150)) {
      const { data } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").in("combo_id", parte);
      for (const c of data ?? []) componentes.set(String(c.combo_id), [...(componentes.get(String(c.combo_id)) ?? []), { id: String(c.componente_id), cantidad: Number(c.cantidad) || 1 }]);
    }
  } catch {
    // Sin catálogo, cada línea cuenta por su nombre.
  }
  /** De qué productos sueltos está hecha una unidad de la línea, y cuántos de cada uno. */
  const partesDe = (l: LineaVenta): { id: string | null; cantidad: number }[] => {
    const comp = l.sku ? componentes.get(l.sku) : undefined;
    if (comp?.length) return comp;
    return [{ id: l.sku, cantidad: unidadesPorNombre(l.producto) }];
  };

  const sueltos = [...new Set(solos.flatMap((l) => partesDe(l).map((p) => p.id)).filter((s): s is string => !!s))];
  let costos = new Map<string, { costo: number; fuente: "promedio_pais" | "promedio_todos" }>();
  try {
    costos = await costosDeProductos(supabase, sueltos, paisId);
  } catch {
    // Sin Compras, queda el costo de la Matriz.
  }

  const porClave = new Map<string, PedidoEconomia[]>();
  for (const l of solos) {
    const partes = partesDe(l);
    const unidades = l.cantidad * partes.reduce((t, p) => t + p.cantidad, 0);
    let costo: number | null = null;
    let fuente: FuenteCosto | null = null;
    let costoUnitario: number | null = null;
    const deCompras = partes.map((p) => (p.id ? costos.get(p.id) : undefined));
    if (deCompras.every(Boolean)) {
      costo = l.cantidad * partes.reduce((t, p, i) => t + p.cantidad * deCompras[i]!.costo, 0);
      fuente = deCompras.some((c) => c!.fuente === "promedio_todos") ? "compras_todos" : "compras_pais";
      costoUnitario = partes.length === 1 ? Math.round(deCompras[0]!.costo * 100) / 100 : null;
    } else if (l.costoMatriz !== null && l.costoMatriz > 0) {
      // La Matriz trae el costo de la línea por cada unidad vendida (por cada pack, en un combo).
      costo = l.cantidad * l.costoMatriz;
      fuente = "matriz";
      costoUnitario = unidades > 0 ? Math.round(((l.cantidad * l.costoMatriz) / unidades) * 100) / 100 : null;
    }
    porClave.set(l.clave, [...(porClave.get(l.clave) ?? []), { venta: l.total ?? 0, unidades, costo, fuente, costoUnitario }]);
  }
  return [...porClave].map(([clave, pedidos]) => economiaDe(clave, pedidos));
}
