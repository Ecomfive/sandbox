// El último cambio de precio de una publicación (30 oct 2026, pedido de Hernán): el que vio la lectura del catálogo de Dropi, el que se
// aplicó desde el sistema con «Aplicar en Dropi» o la fecha anotada (al actualizar desde Dropi, al republicar o la que vino de ClickUp).
// Gana el más reciente. Sin dependencias: lo usan los datos del módulo y la ficha.

/**
 * Para comparar fechas con hora (en UTC) y fechas sin hora (días de Panamá): todo como «día y hora de Panamá». Una fecha sin hora va al
 * empezar el día, así el mismo día gana el cambio con hora (el que dice de cuánto a cuánto).
 */
export function claveFecha(fecha: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return `${fecha}T00:00:00`;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleString("sv-SE", { timeZone: "America/Panama", hour12: false }).replace(" ", "T");
}

/** El más reciente de varios cambios (los que faltan no cuentan); con la misma fecha, el primero. */
export function masReciente<T extends { fecha: string }>(cambios: (T | null | undefined)[]): T | null {
  let r: T | null = null;
  for (const c of cambios) if (c && (!r || claveFecha(c.fecha) > claveFecha(r.fecha))) r = c;
  return r;
}
