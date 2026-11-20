// Pedidos Dropi › Resumen (20 nov 2026, pedido de María José): la pestaña RESUMEN del sheet «ECOMFIVE DROPI 2026» dentro del
// sistema. Los números los suma Postgres (`dropi_resumen_mensual`, migración 0340); aquí se arman los renglones en el orden del
// sheet, para la página y para el Excel. Puro, con prueba en `resumen-mensual.test.ts`.

/** Un mes de `dropi_resumen_mensual`. */
export interface MesDropi {
  periodo: string;
  filas: number;
  pedidos: number;
  cancelados: number;
  rechazados: number;
  entregados: number;
  /** Pedidos por estado, sin CANCELADO ni RECHAZADO. */
  estados: Record<string, number>;
  ganancia_entregados: number;
  ganancia_otros: number;
  entregados_sin_pago: number;
  ordenes_b280: number;
  sin_bodega: number;
  flete_garantia: number;
  flete_recoleccion_garantia: number;
  devolucion_garantia: number;
  indemnizaciones: number;
  otras_salidas_guia: number;
  otros_cobros_sin_guia: number;
  pagos_ganancia: number;
  retiros: number;
  pagos_internacionales: number;
  transferencias_enviadas: number;
  otras_entradas: number;
}

/** Lo que la bodega B280 (fulfillment de Dropi en Panamá) cobra por cada orden que sale de ella, en cualquier estado. */
export const COMISION_B280 = 1.5;

export type FormatoFila = "entero" | "dinero" | "porcentaje";

export interface FilaResumen {
  /** `seccion`: título de un bloque; `total`: renglón en negrita; `detalle`: con sangría; `pendiente`: dato que todavía no hay. */
  tipo: "seccion" | "total" | "detalle" | "pendiente";
  etiqueta: string;
  formato: FormatoFila;
  /** Uno por mes, en el orden de los meses; null = sin dato. */
  valores: (number | null)[];
  nota?: string;
}

/** Los estados que pidió María José van primero; los demás, de mayor a menor en el período. */
const ESTADOS_PRIMERO = ["ENTREGADO", "DEVOLUCION", "EN REPARTO", "NOVEDAD", "SINIESTRO"];

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/** Normaliza lo que devuelve la base (los numéricos de Postgres pueden llegar como texto). */
export function leerMeses(filas: Record<string, unknown>[]): MesDropi[] {
  return filas.map((f) => {
    const estados: Record<string, number> = {};
    for (const [k, v] of Object.entries((f.estados as Record<string, unknown> | null) ?? {})) estados[k] = num(v);
    const m = { periodo: String(f.periodo).slice(0, 10), estados } as MesDropi;
    for (const k of Object.keys(f)) if (k !== "periodo" && k !== "estados") (m as unknown as Record<string, number>)[k] = num(f[k]);
    return m;
  });
}

/** Los renglones del resumen, en el orden del sheet. */
export function filasResumen(meses: MesDropi[]): FilaResumen[] {
  const col = (fn: (m: MesDropi) => number | null) => meses.map(fn);
  const fila = (tipo: FilaResumen["tipo"], etiqueta: string, formato: FormatoFila, fn: (m: MesDropi) => number | null, nota?: string): FilaResumen => ({
    tipo,
    etiqueta,
    formato,
    valores: col(fn),
    ...(nota ? { nota } : {}),
  });
  const seccion = (etiqueta: string, nota?: string): FilaResumen => ({ tipo: "seccion", etiqueta, formato: "entero", valores: meses.map(() => null), ...(nota ? { nota } : {}) });

  const totalPorEstado = new Map<string, number>();
  for (const m of meses) for (const [e, n] of Object.entries(m.estados)) totalPorEstado.set(e, (totalPorEstado.get(e) ?? 0) + n);
  const otros = [...totalPorEstado.keys()].filter((e) => !ESTADOS_PRIMERO.includes(e)).sort((a, b) => (totalPorEstado.get(b) ?? 0) - (totalPorEstado.get(a) ?? 0) || a.localeCompare(b));
  const estados = [...ESTADOS_PRIMERO, ...otros];

  const gastoGarantia = (m: MesDropi) => m.flete_garantia + m.flete_recoleccion_garantia + m.devolucion_garantia + m.indemnizaciones + m.otras_salidas_guia;

  return [
    seccion("Pedidos", "Por la fecha del pedido. No cuentan los cancelados ni los rechazados."),
    fila("total", "Pedidos del mes", "entero", (m) => m.pedidos),
    ...estados.map((e) => fila("detalle", nombreEstado(e), "entero", (m) => m.estados[e] ?? 0)),
    fila("total", "% de entrega", "porcentaje", (m) => (m.pedidos ? m.entregados / m.pedidos : null), "Entregados ÷ pedidos del mes."),
    seccion("No cuentan como pedido"),
    fila("detalle", "Cancelados", "entero", (m) => m.cancelados),
    fila("detalle", "Rechazados", "entero", (m) => m.rechazados),
    fila("detalle", "Total del mes en Dropi", "entero", (m) => m.filas),

    seccion("Ganancia y comisión", "Lo que Dropi acreditó en la billetera por los pedidos de ese mes."),
    fila("detalle", "Ganancia de entregados", "dinero", (m) => r2(m.ganancia_entregados)),
    fila("detalle", "Ganancia de otros estados", "dinero", (m) => r2(m.ganancia_otros)),
    fila("total", "Ganancia total", "dinero", (m) => r2(m.ganancia_entregados + m.ganancia_otros)),
    fila("detalle", "Entregados que Dropi todavía no pagó", "entero", (m) => m.entregados_sin_pago, "Su ganancia entra cuando Dropi los pague; es normal en el mes en curso."),
    fila("total", "Comisión B280 (fulfillment de Dropi)", "dinero", (m) => r2(m.ordenes_b280 * COMISION_B280)),
    fila("detalle", `Órdenes con comisión (${COMISION_B280.toFixed(2)} c/u)`, "entero", (m) => m.ordenes_b280),

    seccion("Coste de productos"),
    fila("pendiente", "Coste de productos entregados", "dinero", () => null, "Sale del costo único del producto (lo prepara Alex con Finanzas)."),

    seccion("Salidas de la billetera que son gasto", "Por la fecha del cobro."),
    fila("detalle", "Flete por garantía", "dinero", (m) => r2(m.flete_garantia)),
    fila("detalle", "Flete por recolección de garantía", "dinero", (m) => r2(m.flete_recoleccion_garantia)),
    fila("detalle", "Devolución de dinero por garantía", "dinero", (m) => r2(m.devolucion_garantia)),
    fila("detalle", "Indemnizaciones", "dinero", (m) => r2(m.indemnizaciones)),
    fila("detalle", "Otras salidas con guía", "dinero", (m) => r2(m.otras_salidas_guia), "Correcciones de estado de guía y reversos de órdenes."),
    fila("total", "Total compensación por garantía", "dinero", (m) => r2(gastoGarantia(m))),
    fila("detalle", "Otros cobros sin guía (almacenamiento, stand…)", "dinero", (m) => r2(m.otros_cobros_sin_guia)),
    fila("total", "Total salidas de Dropi (gasto)", "dinero", (m) => r2(gastoGarantia(m) + m.otros_cobros_sin_guia)),

    seccion("Movimientos de la billetera que no son gasto", "Por la fecha del movimiento."),
    fila("detalle", "Pagos de ganancia recibidos", "dinero", (m) => r2(m.pagos_ganancia)),
    fila("detalle", "Retiros de saldo", "dinero", (m) => r2(m.retiros)),
    fila("detalle", "Pagos internacionales (retiro administrativo)", "dinero", (m) => r2(m.pagos_internacionales)),
    fila("detalle", "Transferencias de billetera enviadas", "dinero", (m) => r2(m.transferencias_enviadas)),
    fila("detalle", "Otras entradas (referidos, reintegros, transferencias recibidas)", "dinero", (m) => r2(m.otras_entradas)),
  ];
}

/** «EN PROCESO DE DEVOLUCION» → «En proceso de devolución». */
export function nombreEstado(estado: string): string {
  const t = estado.replace(/_/g, " ").toLowerCase().replace(/devolucion/g, "devolución").replace(/guia/g, "guía").replace(/transito/g, "tránsito");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** «2026-09-01» → «sept 2026». */
export function mesCorto(periodo: string): string {
  const d = new Date(`${periodo.slice(0, 7)}-15T12:00:00Z`);
  return d.toLocaleDateString("es-PA", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}
