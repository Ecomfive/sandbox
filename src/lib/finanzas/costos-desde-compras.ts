// Costo oficial desde Compras (mejoras 31 y 37, 19 nov 2026). Cada compra que ya llegó deja un lote de costo por producto
// en Costos de mercancía (`fin_costos_lotes`, origen «compras»): el costo puesto por unidad (FOB + gastos de importación) y,
// aparte en su columna, el financiamiento por unidad, que ahora sí entra en el costo total del lote (y con él en el margen).
// Como el costo vigente es el del lote más reciente, en cuanto llega una compra su costo pasa a ser el oficial.
// Lógica pura, con prueba en `costos-desde-compras.test.ts`.

import type { CostoPuesto } from "./compras-costos";

export const ORIGEN_COMPRAS = "compras";

export interface LoteDesdeCompra {
  origen_clave: string;
  hoja: string;
  fila: number;
  linea: string;
  fecha_llegada: string;
  proveedor: string | null;
  producto: string;
  producto_clave: string;
  codigo: string | null;
  sku_maestro_id: string;
  cantidad: number;
  costo_unitario: number;
  envio: number;
  financiamiento: number;
  costo_total: number;
  estatus: string;
}

const r6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/**
 * Los lotes de las compras que ya llegaron (fecha de llegada y no abiertas) con costo. `claveDe` da la clave de producto
 * de cada SKU (la de un lote anterior de ese producto, para no partir su historial) o la del nombre.
 */
export function lotesDesdeCompras(
  costos: (CostoPuesto & { financiamiento?: { total: number } | null })[],
  claveDe: (skuId: string, producto: string) => string,
): LoteDesdeCompra[] {
  const salida: LoteDesdeCompra[] = [];
  for (const c of costos) {
    if (c.abierta || !c.fechaLlegada) continue;
    const finTotal = c.financiamiento?.total ?? 0;
    for (const l of c.lineas) {
      if (!l.skuId || l.cantidad <= 0 || l.unitarioReal === null || l.unitarioReal <= 0) continue;
      // El financiamiento de la OC se reparte entre sus productos como su FOB.
      const finLinea = finTotal > 0 && c.fob > 0 ? (finTotal * l.fob) / c.fob : 0;
      const costoUnitario = r6(l.fob / l.cantidad);
      const envio = r6(l.gastos / l.cantidad);
      const financiamiento = r6(finLinea / l.cantidad);
      salida.push({
        origen_clave: `compra:${c.compraId}:${l.skuId}`,
        hoja: "Compras",
        fila: 0,
        linea: c.codigo || c.nombre,
        fecha_llegada: c.fechaLlegada,
        proveedor: c.proveedor,
        producto: l.producto || c.nombre,
        producto_clave: claveDe(l.skuId, l.producto || c.nombre),
        codigo: l.codigo || null,
        sku_maestro_id: l.skuId,
        cantidad: l.cantidad,
        costo_unitario: costoUnitario,
        envio,
        financiamiento,
        costo_total: r6(costoUnitario + envio + financiamiento),
        estatus: c.gastosPendientes > 0 ? "Gastos de importación por pagar" : "Compra recibida",
      });
    }
  }
  return salida;
}
