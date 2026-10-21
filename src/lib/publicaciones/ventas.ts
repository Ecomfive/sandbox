// Desempeño › Ventas Dropi: cómo se resumen las ventas de cada producto de Dropi a partir de sus unidades por día
// (`dropi_ventas_diarias`, migración 0120). Lógica pura, sin base ni React: la usan la página y su prueba.

/** Las unidades de un producto en un día (hora de Panamá). */
export interface VentaDia {
  producto: number;
  dia: string;
  pedidas: number;
  ordenes: number;
  canceladas: number;
  rechazadas: number;
  devueltas: number;
}

/** Un producto de Dropi con su stock al momento de la carga. */
export interface ProductoDropi {
  id: number;
  nombre: string;
  lista: "activo" | "archivado";
  privado: boolean;
  variable: boolean;
  stock: number;
  primeraVenta: string | null;
  ultimaVenta: string | null;
}

export type Categoria = "estrella" | "se_vende" | "lento" | "sin_ventas" | "nunca";

export const CATEGORIAS: { valor: Categoria; etiqueta: string; detalle: string }[] = [
  { valor: "estrella", etiqueta: "Estrella", detalle: "100 o más netas en 30 días" },
  { valor: "se_vende", etiqueta: "Se vende", detalle: "10 a 99 netas en 30 días" },
  { valor: "lento", etiqueta: "Lento", detalle: "1 a 9 netas en 30 días" },
  { valor: "sin_ventas", etiqueta: "Sin ventas en 30 días", detalle: "vendió antes, pero no en los últimos 30 días" },
  { valor: "nunca", etiqueta: "Nunca vendió", detalle: "sin ninguna orden" },
];

/** Días de inventario por debajo de los cuales se avisa que hay que reponer. */
export const DIAS_REPONER = 15;
/** Días de inventario por encima de los cuales hay sobrestock. */
export const DIAS_SOBRESTOCK = 180;
/** Devoluciones + rechazos por encima de esta parte de lo pedido (con 30+ unidades pedidas) se marcan como altas. */
export const DEVOLUCION_ALTA = 0.2;
/** Cancelaciones por encima de esta parte de lo pedido (con 30+ unidades pedidas) se marcan como altas. */
export const CANCELACION_ALTA = 0.3;

export const netas = (d: Pick<VentaDia, "pedidas" | "canceladas" | "rechazadas" | "devueltas">) => d.pedidas - d.canceladas - d.rechazadas - d.devueltas;

/** La fecha `dias` días antes de `dia` (ambas YYYY-MM-DD). */
export function restarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Los meses (YYYY-MM) de `desde` a `hasta`, ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  const d = new Date(`${desde.slice(0, 7)}-01T12:00:00Z`);
  while (d.toISOString().slice(0, 7) <= hasta.slice(0, 7)) {
    meses.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return meses;
}

export interface ResumenProducto extends ProductoDropi {
  netas30: number;
  netas30Antes: number;
  netas90: number;
  pedidas: number;
  ordenes: number;
  canceladas: number;
  rechazadas: number;
  devueltas: number;
  netasTotal: number;
  /** Parte de lo pedido que se canceló (null sin pedidos). */
  pctCancelacion: number | null;
  /** Parte de lo pedido que se devolvió o rechazó (null sin pedidos). */
  pctDevolucion: number | null;
  /** Netas por día de los últimos 30 días (0 si no vendió). */
  porDia: number;
  /** Stock ÷ netas por día; null si no vende. */
  diasInventario: number | null;
  categoria: Categoria;
  alertas: string[];
  /** Netas por mes (YYYY-MM). */
  porMes: Record<string, number>;
}

/**
 * El resumen de cada producto al día `corte`: los últimos 30 días son de `corte − 29` a `corte`, y los 30 anteriores, los 30 de
 * antes. Las alertas: se acaba el stock (menos de 15 días), sobrestock (más de 180 días o stock sin ventas), devoluciones o
 * cancelaciones altas y una caída de más de la mitad contra el mes anterior.
 */
export function resumirProductos(productos: ProductoDropi[], dias: VentaDia[], corte: string): ResumenProducto[] {
  const desde30 = restarDias(corte, 29);
  const desde60 = restarDias(corte, 59);
  const desde90 = restarDias(corte, 89);
  const porProducto = new Map<number, VentaDia[]>();
  for (const d of dias) {
    const lista = porProducto.get(d.producto);
    if (lista) lista.push(d);
    else porProducto.set(d.producto, [d]);
  }
  return productos.map((p) => {
    const r = { netas30: 0, netas30Antes: 0, netas90: 0, pedidas: 0, ordenes: 0, canceladas: 0, rechazadas: 0, devueltas: 0 };
    const porMes: Record<string, number> = {};
    for (const d of porProducto.get(p.id) ?? []) {
      if (d.dia > corte) continue;
      const n = netas(d);
      r.pedidas += d.pedidas;
      r.ordenes += d.ordenes;
      r.canceladas += d.canceladas;
      r.rechazadas += d.rechazadas;
      r.devueltas += d.devueltas;
      porMes[d.dia.slice(0, 7)] = (porMes[d.dia.slice(0, 7)] ?? 0) + n;
      if (d.dia >= desde30) r.netas30 += n;
      else if (d.dia >= desde60) r.netas30Antes += n;
      if (d.dia >= desde90) r.netas90 += n;
    }
    const netasTotal = netas(r);
    const porDia = Math.max(r.netas30, 0) / 30;
    const diasInventario = porDia > 0 ? Math.round(Math.max(p.stock, 0) / porDia) : null;
    const pctCancelacion = r.pedidas ? r.canceladas / r.pedidas : null;
    const pctDevolucion = r.pedidas ? (r.devueltas + r.rechazadas) / r.pedidas : null;
    const categoria: Categoria = !r.pedidas ? "nunca" : r.netas30 >= 100 ? "estrella" : r.netas30 >= 10 ? "se_vende" : r.netas30 >= 1 ? "lento" : "sin_ventas";
    const alertas: string[] = [];
    if (porDia > 0 && diasInventario !== null && diasInventario < DIAS_REPONER) alertas.push(p.stock <= 0 ? "Sin stock y se está vendiendo" : `Stock para ${diasInventario} ${diasInventario === 1 ? "día" : "días"}`);
    if (p.stock > 0 && (diasInventario === null || diasInventario > DIAS_SOBRESTOCK)) alertas.push(r.netas30 > 0 ? `Sobrestock (${diasInventario} días)` : "Stock quieto");
    if (r.pedidas >= 30 && pctDevolucion !== null && pctDevolucion > DEVOLUCION_ALTA) alertas.push(`Devoluciones altas (${Math.round(pctDevolucion * 100)} %)`);
    if (r.pedidas >= 30 && pctCancelacion !== null && pctCancelacion > CANCELACION_ALTA) alertas.push(`Cancelaciones altas (${Math.round(pctCancelacion * 100)} %)`);
    if (r.netas30Antes >= 10 && r.netas30 < r.netas30Antes * 0.5) alertas.push("Cayó más de la mitad");
    return { ...p, ...r, netasTotal, pctCancelacion, pctDevolucion, porDia, diasInventario, categoria, alertas, porMes };
  });
}

/** El producto se está vendiendo y no tiene stock, o le alcanza para menos de 15 días. */
export const hayQueReponer = (r: ResumenProducto) => r.netas30 > 0 && (r.stock <= 0 || (r.diasInventario !== null && r.diasInventario < DIAS_REPONER));

/** Los totales de todos los productos por mes, de `desde` a `corte`. */
export function totalesPorMes(dias: VentaDia[], desde: string, corte: string) {
  const meses = mesesEntre(desde, corte);
  const t = new Map(meses.map((m) => [m, { mes: m, pedidas: 0, canceladas: 0, rechazadas: 0, devueltas: 0, netas: 0 }]));
  for (const d of dias) {
    const fila = d.dia <= corte ? t.get(d.dia.slice(0, 7)) : undefined;
    if (!fila) continue;
    fila.pedidas += d.pedidas;
    fila.canceladas += d.canceladas;
    fila.rechazadas += d.rechazadas;
    fila.devueltas += d.devueltas;
    fila.netas += netas(d);
  }
  return meses.map((m) => t.get(m)!);
}

/** Las netas y pedidas de todos los productos por día, los últimos `cuantos` días hasta `corte` (los días sin ventas en 0). */
export function totalesPorDia(dias: VentaDia[], corte: string, cuantos: number) {
  const desde = restarDias(corte, cuantos - 1);
  const t = new Map<string, { dia: string; pedidas: number; netas: number }>();
  for (let i = cuantos - 1; i >= 0; i--) {
    const dia = restarDias(corte, i);
    t.set(dia, { dia, pedidas: 0, netas: 0 });
  }
  for (const d of dias) {
    if (d.dia < desde || d.dia > corte) continue;
    const fila = t.get(d.dia)!;
    fila.pedidas += d.pedidas;
    fila.netas += netas(d);
  }
  return [...t.values()];
}

// --- Gestión de publicaciones Dropi: las ventas de una publicación ---------------------------------------------------

/** Lo que muestra una publicación de sus ventas en Dropi (la suma de sus IDs, si tiene varios). */
export interface VentasPublicacion {
  /** Los IDs de Dropi que suma (los que tienen datos). */
  ids: number[];
  netas30: number;
  netas30Antes: number;
  netas90: number;
  pedidas: number;
  canceladas: number;
  rechazadas: number;
  devueltas: number;
  netasTotal: number;
  pctCancelacion: number | null;
  pctDevolucion: number | null;
  stock: number;
  diasInventario: number | null;
  ultimaVenta: string | null;
  /** Netas por mes (YYYY-MM). */
  porMes: Record<string, number>;
  /** El estado de venta que dicen los datos (valores de `ESTADOS_VENTA`). */
  estadoSugerido: "mas_vendidos" | "estable" | "lento" | "estancado" | "sin_stock";
  /** Cómo anda el stock: sin stock vendiéndose, se acaba (menos de 15 días), alcanza o sin ventas. */
  stockEstado: "sin_stock_vende" | "se_acaba" | "alcanza" | "sin_ventas";
}

/**
 * El estado de venta según Dropi, con los mismos cortes de la lista de ClickUp por unidades netas de los últimos 30 días:
 * Más vendidos +500, Estable +100, Lento 20 a 99, Estancado menos de 20; Sin stock si no le queda stock.
 */
export function estadoVentaSugerido(netas30: number, stock: number): VentasPublicacion["estadoSugerido"] {
  if (stock <= 0) return "sin_stock";
  if (netas30 >= 500) return "mas_vendidos";
  if (netas30 >= 100) return "estable";
  if (netas30 >= 20) return "lento";
  return "estancado";
}

/** Suma las ventas de los IDs de Dropi de una publicación («7231-7679» son dos). `null` si ninguno tiene datos. */
export function ventasDePublicacion(ids: number[], resumen: Map<number, ResumenProducto>): VentasPublicacion | null {
  const rs = [...new Set(ids)].map((id) => resumen.get(id)).filter((r): r is ResumenProducto => !!r);
  if (!rs.length) return null;
  const suma = (f: (r: ResumenProducto) => number) => rs.reduce((a, r) => a + f(r), 0);
  const v = {
    netas30: suma((r) => r.netas30),
    netas30Antes: suma((r) => r.netas30Antes),
    netas90: suma((r) => r.netas90),
    pedidas: suma((r) => r.pedidas),
    canceladas: suma((r) => r.canceladas),
    rechazadas: suma((r) => r.rechazadas),
    devueltas: suma((r) => r.devueltas),
    stock: suma((r) => Math.max(r.stock, 0)),
  };
  const porMes: Record<string, number> = {};
  for (const r of rs) for (const [m, n] of Object.entries(r.porMes)) porMes[m] = (porMes[m] ?? 0) + n;
  const porDia = Math.max(v.netas30, 0) / 30;
  const diasInventario = porDia > 0 ? Math.round(v.stock / porDia) : null;
  const ultimaVenta = rs.reduce<string | null>((a, r) => (r.ultimaVenta && (!a || r.ultimaVenta > a) ? r.ultimaVenta : a), null);
  return {
    ids: rs.map((r) => r.id),
    ...v,
    netasTotal: netas(v),
    pctCancelacion: v.pedidas ? v.canceladas / v.pedidas : null,
    pctDevolucion: v.pedidas ? (v.devueltas + v.rechazadas) / v.pedidas : null,
    diasInventario,
    ultimaVenta,
    porMes,
    estadoSugerido: estadoVentaSugerido(v.netas30, v.stock),
    stockEstado: v.netas30 <= 0 ? "sin_ventas" : v.stock <= 0 ? "sin_stock_vende" : diasInventario !== null && diasInventario < DIAS_REPONER ? "se_acaba" : "alcanza",
  };
}
