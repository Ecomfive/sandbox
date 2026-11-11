// Cálculos de Ventas por tienda sobre el resumen mensual (`ven_resumen_mensual`): totales de varias tiendas o meses,
// cobertura de costo y la comparación con los ingresos del libro. Lógica pura; prueba en `resumen.test.ts`.

import type { EstadoEntrega, MetodoPago } from "./matriz";

export interface FilaResumen {
  periodo: string;
  unidad_id: string;
  tienda: string;
  ordenes: number;
  enviadas: number;
  entregadas: number;
  devueltas: number;
  en_transito: number;
  pendientes: number;
  canceladas: number;
  no_gestionadas: number;
  ventas_brutas: number;
  ventas_entregadas: number;
  costo_mercancia: number;
  costo_envio: number;
  lineas_producto: number;
  lineas_costo_vigente: number;
  lineas_costo_excel: number;
}

export interface Totales extends Omit<FilaResumen, "periodo" | "unidad_id" | "tienda"> {
  tasa_entrega: number | null;
  tasa_sobre_ordenes: number | null;
  ticket_promedio: number | null;
  margen_bruto: number;
  margen_pct: number | null;
  /** Parte de las líneas de producto entregadas con costo (vigente o de la Matriz), de 0 a 1. */
  cobertura_costo: number | null;
  cobertura_vigente: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number) => (b ? a / b : null);

const CAMPOS = [
  "ordenes",
  "enviadas",
  "entregadas",
  "devueltas",
  "en_transito",
  "pendientes",
  "canceladas",
  "no_gestionadas",
  "ventas_brutas",
  "ventas_entregadas",
  "costo_mercancia",
  "costo_envio",
  "lineas_producto",
  "lineas_costo_vigente",
  "lineas_costo_excel",
] as const;

/** Suma filas del resumen y recalcula tasas, ticket, margen y cobertura (no se promedian porcentajes). */
export function sumar(filas: FilaResumen[]): Totales {
  const t = Object.fromEntries(CAMPOS.map((c) => [c, 0])) as Record<(typeof CAMPOS)[number], number>;
  for (const f of filas) for (const c of CAMPOS) t[c] += Number(f[c]) || 0;
  for (const c of ["ventas_brutas", "ventas_entregadas", "costo_mercancia", "costo_envio"] as const) t[c] = r2(t[c]);
  const margen = r2(t.ventas_entregadas - t.costo_mercancia - t.costo_envio);
  return {
    ...t,
    tasa_entrega: div(t.entregadas, t.enviadas),
    tasa_sobre_ordenes: div(t.entregadas, t.ordenes),
    ticket_promedio: t.entregadas ? r2(t.ventas_entregadas / t.entregadas) : null,
    margen_bruto: margen,
    margen_pct: div(margen, t.ventas_entregadas),
    cobertura_costo: div(t.lineas_costo_vigente + t.lineas_costo_excel, t.lineas_producto),
    cobertura_vigente: div(t.lineas_costo_vigente, t.lineas_producto),
  };
}

/** Agrupa el resumen por una llave (mes o tienda) y suma cada grupo. */
export function agrupar(filas: FilaResumen[], llave: (f: FilaResumen) => string): Map<string, Totales> {
  const grupos = new Map<string, FilaResumen[]>();
  for (const f of filas) {
    const k = llave(f);
    const g = grupos.get(k);
    if (g) g.push(f);
    else grupos.set(k, [f]);
  }
  return new Map([...grupos].map(([k, g]) => [k, sumar(g)]));
}

export interface IngresoLibro {
  periodo: string;
  unidad_id: string;
  /** Tipo «Ingresos» (signo +). */
  bruto: number;
  /** Tipo «Devoluciones» (signo −), en positivo. */
  devoluciones: number;
}

export interface FilaCuadreLibro {
  periodo: string;
  unidad_id: string;
  tienda: string;
  ventas_entregadas: number;
  entregadas: number;
  ingresos_libro: number | null;
  devoluciones_libro: number;
  diferencia: number | null;
  /** Diferencia sobre lo del libro, en %. */
  diferencia_pct: number | null;
}

/** Tolerancia para decir que una tienda y mes cuadran con el libro (centavos de redondeo). */
export const TOLERANCIA_CUADRE = 1;

/** Ventas entregadas de cada tienda y mes contra los ingresos que el libro le imputa a esa tienda en ese mes. */
export function cuadreConLibro(ventas: FilaResumen[], libro: IngresoLibro[]): FilaCuadreLibro[] {
  const enLibro = new Map(libro.map((l) => [`${l.periodo}|${l.unidad_id}`, l]));
  return ventas
    .map((v) => {
      const l = enLibro.get(`${v.periodo}|${v.unidad_id}`);
      const ingresos = l ? r2(l.bruto) : null;
      const diferencia = ingresos === null ? null : r2(v.ventas_entregadas - ingresos);
      return {
        periodo: v.periodo,
        unidad_id: v.unidad_id,
        tienda: v.tienda,
        ventas_entregadas: r2(v.ventas_entregadas),
        entregadas: v.entregadas,
        ingresos_libro: ingresos,
        devoluciones_libro: l ? r2(l.devoluciones) : 0,
        diferencia,
        diferencia_pct: diferencia === null || !ingresos ? null : (100 * diferencia) / ingresos,
      };
    })
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.tienda.localeCompare(b.tienda));
}

export const ETIQUETA_ESTADO: Record<EstadoEntrega, string> = {
  entregada: "Entregada",
  en_transito: "En tránsito",
  pendiente: "Pendiente",
  devuelta: "Devuelta",
  cancelada: "Cancelada",
  no_gestionada: "No gestionada",
};

export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo contra entrega",
  yappy: "Yappy",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  servientrega: "Recaudo Servientrega",
  clicksi: "Gestionado por Clicksi",
  previo_pago: "Pago previo",
  otro: "Otro",
};
