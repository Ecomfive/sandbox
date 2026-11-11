// Clases compartidas del Portal AF4 360°: las usan componentes de servidor y de cliente.

/** Un botón de acción de la barra de contexto (Descargar, Imprimir): 32 px de alto, borde de control. */
export const claseAccionAF4 =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border-control bg-card px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted";

/** La franja de título de un bloque (gráfica, tabla), la misma del `KpiGroup`. */
export const claseFranjaAF4 =
  "flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-muted px-4 py-1.5";

/** Una cifra: números tabulares para que las columnas y los KPIs no bailen. */
export const claseCifra = "tabular-nums [font-feature-settings:'tnum','lnum']";

/** El color de un resultado según su signo (solo para subtotales y totales: un detalle negativo es un reverso). */
export const claseSigno = (v: number | null | undefined) => (v !== null && v !== undefined && v < -0.005 ? "text-destructive" : "");

/**
 * El peso visual de cada tipo de fila de una tabla financiera (lo usan `TablaFinanciera`, `TablaComparacionAF4` y las
 * tablas propias de un módulo): los resultados con filete más marcado y el total final con doble filete contable.
 */
export type PesoFilaAF4 = "grupo" | "seccion" | "detalle" | "subtotal" | "total" | "porcentaje" | "saldo";

export const CLASE_FILA_AF4: Record<PesoFilaAF4, string> = {
  grupo: "border-t-2 border-border font-semibold",
  seccion: "border-t border-border font-medium",
  detalle: "text-muted-foreground",
  subtotal: "border-t border-border-control font-semibold",
  total: "border-t border-border-control border-b-[3px] border-b-border-control border-double font-semibold",
  porcentaje: "text-xs text-muted-foreground italic",
  saldo: "border-t border-border text-foreground-soft",
};

/** El fondo de cada tipo de fila; también va en la celda fija de la izquierda (opaco: no se ve lo que pasa debajo). */
export const FONDO_FILA_AF4: Record<PesoFilaAF4, string> = {
  grupo: "bg-[color-mix(in_oklab,var(--muted)_70%,var(--card))]",
  seccion: "bg-card",
  detalle: "bg-card",
  subtotal: "bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]",
  total: "bg-[color-mix(in_oklab,var(--muted)_70%,var(--card))]",
  porcentaje: "bg-card",
  saldo: "bg-card",
};

/** Una celda de tabla financiera y su versión numérica (a la derecha, cifras tabulares). */
export const claseCeldaAF4 = "border-r border-border/40 px-3 py-2 whitespace-nowrap";
export const claseNumeroAF4 = `${claseCeldaAF4} text-right tabular-nums`;
