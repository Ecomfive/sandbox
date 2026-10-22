// Desempeño › Ventas Dropi: la plata de cada producto (migración 0130), sacada de la hoja ÓRDENES del Excel «ECOMFIVE DROPI 2026
// DIARIO» que lleva la oficina. Usa las mismas reglas de su hoja RESUMEN: la ganancia es lo que Dropi le paga a ECOMFIVE por la
// orden, la comisión B280 (1,50 por orden de esa bodega) se suma tal como viene, el coste real solo existe en las entregadas y los
// descuentos son los cobros de garantía o indemnización de esa guía. Los fletes los paga el dropshipper: no entran.
// Lógica pura, sin base ni React: la usan el importador, la página y su prueba.

/** Lo que trae una orden del Excel (una fila de ÓRDENES). */
export interface OrdenDinero {
  /** YYYY-MM-DD, la fecha de la orden. */
  dia: string;
  estatus: string;
  ganancia: number;
  comision: number;
  coste: number;
  descuentos: number;
  /** Los ids de producto de Dropi, en el orden en que vienen («7854 | 7652»). */
  productos: number[];
  /** Las unidades de cada producto, sacadas de «1x NOMBRE | 2x NOMBRE»; si no se pueden leer, 1. */
  unidades: number[];
  /** El nombre de cada producto, sin el «Nx ». */
  nombres: string[];
}

/** La plata de un producto en un día. */
export interface DineroDia {
  producto: number;
  dia: string;
  entregadas: number;
  unidades: number;
  ganancia: number;
  comision: number;
  coste: number;
  descuentos: number;
}

export const utilidad = (d: Pick<DineroDia, "ganancia" | "comision" | "coste" | "descuentos">) => d.ganancia - d.comision - d.coste - d.descuentos;

/** «1x TONICO TRULY (B280) | 2x OTRO» → [{ unidades: 1, nombre: "TONICO TRULY (B280)" }, …]. */
export function lineasDeProducto(texto: string): { unidades: number; nombre: string }[] {
  return String(texto ?? "")
    .split(" | ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d+)\s*x\s+(.*)$/i.exec(t);
      return m ? { unidades: Math.max(1, Number(m[1])), nombre: m[2].trim() } : { unidades: 1, nombre: t };
    });
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Reparte un monto entre partes según su peso, en centavos y sin perder ni sumar un centavo (el último se lleva el resto). */
export function repartir(monto: number, pesos: number[]): number[] {
  const total = pesos.reduce((a, b) => a + b, 0);
  if (!pesos.length) return [];
  const base = total > 0 ? pesos : pesos.map(() => 1);
  const suma = base.reduce((a, b) => a + b, 0);
  const partes = base.map((p) => centavos((monto * p) / suma));
  partes[partes.length - 1] = centavos(monto - partes.slice(0, -1).reduce((a, b) => a + b, 0));
  return partes;
}

/**
 * Reparte cada orden entre sus productos y suma por producto y día. La ganancia, la comisión y los descuentos se reparten por
 * `precio(id) × unidades` (el precio de proveedor de la publicación; sin precio, por unidades); el coste, por `costo(nombre) ×
 * unidades` (el costo unitario del mes en la hoja COSTOS; sin costo, con el mismo peso que la ganancia). Una orden de un solo
 * producto se queda con todo.
 */
export function dineroPorDia(ordenes: OrdenDinero[], precio: (id: number) => number | null, costo: (mes: string, nombre: string) => number | null): DineroDia[] {
  const acum = new Map<string, DineroDia>();
  for (const o of ordenes) {
    const n = o.productos.length;
    if (!n) continue;
    const unidades = o.productos.map((_, i) => o.unidades[i] ?? 1);
    const pesoPrecio = o.productos.map((id, i) => (precio(id) ?? 0) * unidades[i]);
    const pesoVenta = pesoPrecio.some((p) => p > 0) && pesoPrecio.every((p) => p > 0) ? pesoPrecio : unidades;
    const pesoCosto = o.productos.map((_, i) => (costo(o.dia.slice(0, 7), o.nombres[i] ?? "") ?? 0) * unidades[i]);
    const ganancia = repartir(o.ganancia, pesoVenta);
    const comision = repartir(o.comision, pesoVenta);
    const descuentos = repartir(o.descuentos, pesoVenta);
    const coste = repartir(o.coste, pesoCosto.every((p) => p > 0) ? pesoCosto : pesoVenta);
    const entregada = o.estatus === "ENTREGADO";
    o.productos.forEach((id, i) => {
      const k = `${id}|${o.dia}`;
      const d = acum.get(k) ?? { producto: id, dia: o.dia, entregadas: 0, unidades: 0, ganancia: 0, comision: 0, coste: 0, descuentos: 0 };
      acum.set(k, d);
      if (entregada) {
        d.entregadas++;
        d.unidades += unidades[i];
      }
      d.ganancia = centavos(d.ganancia + ganancia[i]);
      d.comision = centavos(d.comision + comision[i]);
      d.coste = centavos(d.coste + coste[i]);
      d.descuentos = centavos(d.descuentos + descuentos[i]);
    });
  }
  return [...acum.values()];
}

/** Suma la plata por mes (YYYY-MM), para la gráfica y el detalle de un producto. */
export function dineroPorMes(dias: DineroDia[], producto?: number): Map<string, Omit<DineroDia, "producto" | "dia"> & { utilidad: number }> {
  const m = new Map<string, Omit<DineroDia, "producto" | "dia"> & { utilidad: number }>();
  for (const d of dias) {
    if (producto !== undefined && d.producto !== producto) continue;
    const k = d.dia.slice(0, 7);
    const x = m.get(k) ?? { entregadas: 0, unidades: 0, ganancia: 0, comision: 0, coste: 0, descuentos: 0, utilidad: 0 };
    m.set(k, x);
    x.entregadas += d.entregadas;
    x.unidades += d.unidades;
    x.ganancia = centavos(x.ganancia + d.ganancia);
    x.comision = centavos(x.comision + d.comision);
    x.coste = centavos(x.coste + d.coste);
    x.descuentos = centavos(x.descuentos + d.descuentos);
    x.utilidad = centavos(utilidad(x));
  }
  return m;
}

/** El margen: la utilidad sobre la ganancia (null sin ganancia). */
export const margen = (d: Pick<DineroDia, "ganancia" | "comision" | "coste" | "descuentos">) => (d.ganancia > 0 ? utilidad(d) / d.ganancia : null);
