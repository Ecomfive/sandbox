// Buscar y filtrar por país en el portal del proveedor (26 oct 2026, pedido de Hernán y Francis): lo mismo en el portal de Shen Zhen
// y en el Tablero de Shen Zhen, en todas sus pestañas (también el Registro de pagos).

export interface FiltroPortal {
  /** Lo escrito en el buscador. */
  buscar: string;
  /** Código del país («PA»), o null = todos. «—» = sin país. */
  pais: string | null;
}

export const FILTRO_VACIO: FiltroPortal = { buscar: "", pais: null };

/** Sin mayúsculas, sin acentos y con un solo espacio: «Colágeno» y «colageno» son lo mismo. */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const filtroActivo = (f: FiltroPortal) => f.pais !== null || normalizar(f.buscar) !== "";

/**
 * Si una fila pasa el filtro. `textos` son los que se buscan (nombre original, su traducción, código ECOM01-0525); cada palabra de lo
 * buscado tiene que estar en alguno de ellos, en cualquier orden («ajo 180» encuentra «Aged Garlic … Ajo 180 Softgel»).
 */
export function pasaFiltro(f: FiltroPortal, textos: (string | null | undefined)[], paisCodigo: string | null): boolean {
  if (f.pais !== null && (paisCodigo ?? "—") !== f.pais) return false;
  const palabras = normalizar(f.buscar).split(" ").filter(Boolean);
  if (!palabras.length) return true;
  const donde = normalizar(textos.filter(Boolean).join(" "));
  return palabras.every((p) => donde.includes(p));
}

/** Los países que hay, en orden, para los botones del filtro («—» al final si hay filas sin país). */
export function paisesDe(codigos: (string | null)[]): string[] {
  const todos = [...new Set(codigos.map((c) => c ?? "—"))];
  return [...todos.filter((c) => c !== "—").sort(), ...(todos.includes("—") ? ["—"] : [])];
}
