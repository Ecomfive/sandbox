/** Las etiquetas como las de ClickUp, comunes a los módulos (Compras, chats de WhatsApp): reglas puras. */

/** Largo máximo del nombre de una etiqueta. */
export const MAX_ETIQUETA = 40;
/** Cuántas etiquetas puede tener un registro. */
export const MAX_ETIQUETAS = 20;

/** Sin acentos, en minúsculas y sin espacios de sobra: para comparar nombres. */
export const normalEtiqueta = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El nombre limpio de una etiqueta (sin comas, que separan la lista al guardar), o null si queda vacío. */
export function limpiarEtiqueta(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const limpio = t.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ETIQUETA).trim();
  return limpio || null;
}

/** Una lista de etiquetas válida: nombres limpios, sin repetidos (sin mirar mayúsculas ni acentos) y hasta MAX_ETIQUETAS. */
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const crudo of lista) {
    const e = limpiarEtiqueta(crudo);
    if (!e || vistas.has(normalEtiqueta(e))) continue;
    vistas.add(normalEtiqueta(e));
    salida.push(e);
    if (salida.length >= MAX_ETIQUETAS) break;
  }
  return salida;
}

/** Un color de etiqueta válido (#RRGGBB). */
export const colorValido = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
