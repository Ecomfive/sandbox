export const ESTADO_ETIQUETA: Record<string, string> = {
  abierto: "Abierto",
  cancelado: "Cancelado",
  novedad: "Novedad",
  cerrado: "Cerrado",
  // Al resolver una novedad («Resolver» de su sección) el retiro ya no vuelve a "abierto": queda
  // marcado aparte, sin seguir el flujo normal de conciliación (ver `resolverNovedadRetiro`).
  novedad_resuelta: "Novedad resuelta",
};

/** El color de la insignia de cada estado — el mismo en toda la ficha y la tabla de Retiros
 * (antes cada archivo tenía su propia copia de este mapa). */
export const ESTADO_TONO: Record<string, "info" | "neutral" | "destructive" | "success" | "warning"> = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
  novedad_resuelta: "warning",
};

/** La columna «Consolidación» (tabla y ficha) tiene tres estados posibles — no es solo el booleano
 * `consolidado`: mientras el retiro tiene una novedad ya resuelta, se llama «Novedad resuelta» en
 * vez de saltar directo a «Consolidado», aunque por dentro `consolidado` ya esté en `true` (ver
 * `resolverNovedadRetiro`). El mismo texto de la etiqueta del `estado` (ver arriba), reutilizado
 * para no tener un tercer mapa suelto. */
export function estadoConsolidacion(fila: {
  estado: string;
  consolidado: boolean;
  /** Migración 0048: la novedad se resolvió a mano (el estado ya es «Cerrado»). */
  novedadResuelta?: boolean;
}): { texto: string; tono: "warning" | "success" } {
  // `estado === "novedad_resuelta"` es el modelo anterior a la migración 0048 (filas aún sin convertir).
  if (fila.novedadResuelta || fila.estado === "novedad_resuelta") return { texto: ESTADO_ETIQUETA.novedad_resuelta, tono: "warning" };
  return fila.consolidado ? { texto: "Consolidado", tono: "success" } : { texto: "Pendiente", tono: "warning" };
}
