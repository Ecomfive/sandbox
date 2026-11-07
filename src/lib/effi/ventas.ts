/**
 * Las ventas de Effi por artículo y día (7 nov 2026, pedido de Hernán; migración 0244). Según la documentación de su API (Integraciones › Documentación API), una venta de un
 * dropshipper queda como **remisión de venta** y su devolución como **devolución de venta**; `detalle_remision_v` y `detalle_devolucion_v` traen una fila por artículo. Solo cuenta
 * la bodega Principal: las bodegas con nombre de tienda son de cada dropshipper. Sin base ni red, con prueba.
 */

/** Cuántos días hacia atrás se vuelven a leer en cada lectura: cubre el corte y lo que se anule o devuelva tarde. */
export const DIAS_VENTAS_EFFI = 45;

/** La bodega nuestra en Effi, la misma de `stock_principal`. */
const BODEGA_NUESTRA = "principal";

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export interface FilaDetalleEffi {
  articulo?: unknown;
  cantidad?: unknown;
  fecha_trans?: unknown;
  vigente?: unknown;
  nombre_bodega?: unknown;
}

export interface VentaEffiDia {
  productoId: string;
  dia: string;
  salidas: number;
  devueltas: number;
}

const FECHA = /^(\d{4}-\d{2}-\d{2})/;

/** Junta las filas de remisiones y devoluciones por artículo y día. Una anulada no cuenta, ni una de otra bodega, ni una sin artículo, fecha o cantidad. */
export function ventasPorDia(remisiones: readonly FilaDetalleEffi[], devoluciones: readonly FilaDetalleEffi[]): VentaEffiDia[] {
  const porClave = new Map<string, VentaEffiDia>();
  const sumar = (f: FilaDetalleEffi, campo: "salidas" | "devueltas") => {
    if (String(f.vigente ?? "") !== "1") return;
    if (typeof f.nombre_bodega !== "string" || sinTildes(f.nombre_bodega) !== BODEGA_NUESTRA) return;
    const productoId = typeof f.articulo === "string" || typeof f.articulo === "number" ? String(f.articulo).trim() : "";
    const dia = typeof f.fecha_trans === "string" ? FECHA.exec(f.fecha_trans)?.[1] : undefined;
    const cantidad = Math.round(Number(f.cantidad));
    if (!productoId || !dia || !Number.isFinite(cantidad) || cantidad <= 0) return;
    const clave = `${productoId}|${dia}`;
    const v = porClave.get(clave) ?? { productoId, dia, salidas: 0, devueltas: 0 };
    v[campo] += cantidad;
    porClave.set(clave, v);
  };
  for (const r of remisiones) sumar(r, "salidas");
  for (const d of devoluciones) sumar(d, "devueltas");
  return [...porClave.values()].sort((a, b) => (a.dia === b.dia ? a.productoId.localeCompare(b.productoId) : a.dia.localeCompare(b.dia)));
}

/** El día de hoy y el de hace `dias`, en Costa Rica (la zona de la cuenta de Effi). */
export function ventanaVentas(ahora: Date, dias = DIAS_VENTAS_EFFI): { desde: string; hasta: string } {
  const enCR = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
  return { desde: enCR(new Date(ahora.getTime() - dias * 86_400_000)), hasta: enCR(ahora) };
}
