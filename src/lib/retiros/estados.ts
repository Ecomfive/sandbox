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
