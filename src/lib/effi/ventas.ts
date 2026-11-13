/**
 * Las ventas de Effi por artículo y día (7 nov 2026, pedido de Hernán; migración 0244). Según la documentación de su API (Integraciones › Documentación API), una venta de un
 * dropshipper queda como **remisión de venta** y su devolución como **devolución de venta**; `detalle_remision_v` y `detalle_devolucion_v` traen una fila por artículo. Solo cuenta
 * la bodega Principal: las bodegas con nombre de tienda son de cada dropshipper. Sin base ni red, con prueba.
 */

/**
 * Cuántos días hacia atrás se vuelven a leer en cada lectura (13 nov 2026, pedido de Hernán: «la primera corrida trae todo el historial, después solo los
 * últimos 30 días»). Una devolución se cuenta en el día de su remisión: lo de los últimos 30 días se rehace entero, con sus devoluciones aunque lleguen
 * después; un día más viejo queda como estaba.
 */
export const DIAS_VENTAS_EFFI = 30;

/** Desde cuándo se lee en la primera corrida (todo el historial de la cuenta de Effi). */
export const INICIO_VENTAS_EFFI = "2026-01-01";

/** La bodega nuestra en Effi, la misma de `stock_principal`. */
const BODEGA_NUESTRA = "principal";

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export interface FilaDetalleEffi {
  /** La remisión de la fila (en `detalle_remision_v`). */
  id_remision_v?: unknown;
  /** La devolución de la fila (en `detalle_devolucion_v`): su remisión viene en la cabecera (`devolucion_v`). */
  id_devolucion_v?: unknown;
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

const idDe = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/**
 * Junta las filas de remisiones y devoluciones por artículo y día. La devolución se cuenta en el **día de su remisión** (13 nov 2026): en Effi un pedido de
 * dropshipper es una remisión y, si no se concreta, se le abona una devolución días o semanas después, en tandas; contada en su propio día, una ventana de
 * fechas mezclaba devoluciones de pedidos de antes y daba casi tanto devuelto como salido. Una devolución sin su remisión entre las leídas no cuenta. Una
 * anulada no cuenta, ni una de otra bodega, ni una sin artículo, fecha o cantidad.
 */
/** Una devolución de venta (cabecera, `devolucion_v`): a qué remisión se abona. */
export interface CabeceraDevolucionEffi {
  id_devolucion_v?: unknown;
  id_remision_v?: unknown;
}

export function ventasPorDia(remisiones: readonly FilaDetalleEffi[], devoluciones: readonly FilaDetalleEffi[], cabeceras: readonly CabeceraDevolucionEffi[] = []): VentaEffiDia[] {
  // El detalle de una devolución no trae su remisión: la trae la cabecera.
  const remisionDeDevolucion = new Map(cabeceras.map((c) => [idDe(c.id_devolucion_v), idDe(c.id_remision_v)] as const).filter(([d, r]) => d && r));
  const porClave = new Map<string, VentaEffiDia>();
  const diaDeRemision = new Map<string, string>();
  const valida = (f: FilaDetalleEffi) => String(f.vigente ?? "") === "1" && typeof f.nombre_bodega === "string" && sinTildes(f.nombre_bodega) === BODEGA_NUESTRA;
  const sumar = (productoId: string, dia: string, cantidad: number, campo: "salidas" | "devueltas") => {
    const clave = `${productoId}|${dia}`;
    const v = porClave.get(clave) ?? { productoId, dia, salidas: 0, devueltas: 0 };
    v[campo] += cantidad;
    porClave.set(clave, v);
  };
  for (const r of remisiones) {
    if (!valida(r)) continue;
    const productoId = idDe(r.articulo);
    const dia = typeof r.fecha_trans === "string" ? FECHA.exec(r.fecha_trans)?.[1] : undefined;
    const cantidad = Math.round(Number(r.cantidad));
    if (!productoId || !dia || !Number.isFinite(cantidad) || cantidad <= 0) continue;
    const remision = idDe(r.id_remision_v);
    if (remision) diaDeRemision.set(remision, dia);
    sumar(productoId, dia, cantidad, "salidas");
  }
  for (const d of devoluciones) {
    if (!valida(d)) continue;
    const productoId = idDe(d.articulo);
    const dia = diaDeRemision.get(idDe(d.id_remision_v) || remisionDeDevolucion.get(idDe(d.id_devolucion_v)) || "");
    const cantidad = Math.round(Number(d.cantidad));
    if (!productoId || !dia || !Number.isFinite(cantidad) || cantidad <= 0) continue;
    sumar(productoId, dia, cantidad, "devueltas");
  }
  return [...porClave.values()].sort((a, b) => (a.dia === b.dia ? a.productoId.localeCompare(b.productoId) : a.dia.localeCompare(b.dia)));
}

/** El día de hoy y el de hace `dias`, en Costa Rica (la zona de la cuenta de Effi). */
export function ventanaVentas(ahora: Date, dias = DIAS_VENTAS_EFFI): { desde: string; hasta: string } {
  const enCR = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
  return { desde: enCR(new Date(ahora.getTime() - dias * 86_400_000)), hasta: enCR(ahora) };
}
