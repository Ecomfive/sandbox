// Paginación de una tabla: qué filas tocan en cada página y qué botones de página se dibujan. Sin React, para poder probarlo.

export interface PaginaCalculada {
  /** Página actual (1 a `totalPaginas`), ya corregida si la pedida no existe. */
  pagina: number;
  totalPaginas: number;
  /** Índices para `slice(inicio, fin)` sobre la lista completa. */
  inicio: number;
  fin: number;
  /** Rango que se muestra, contado desde 1 («51–100 de 136»); 0 y 0 si no hay filas. */
  desde: number;
  hasta: number;
  total: number;
}

/** La página `pedida` de una lista de `total` filas con `porPagina` por página; una página que no existe se corrige a la más cercana. */
export function calcularPagina(total: number, porPagina: number, pedida: number): PaginaCalculada {
  const tamano = Math.max(1, Math.floor(porPagina));
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const pagina = Math.min(Math.max(1, Math.floor(Number.isFinite(pedida) ? pedida : 1)), totalPaginas);
  const inicio = (pagina - 1) * tamano;
  const fin = Math.min(inicio + tamano, total);
  return { pagina, totalPaginas, inicio, fin, desde: total === 0 ? 0 : inicio + 1, hasta: fin, total };
}

export type BotonPagina = number | "…";

/**
 * Los botones de la fila de páginas: siempre la primera y la última, la actual con una vecina a cada lado, y
 * «…» donde se saltan páginas. Con pocas páginas salen todas. Un hueco de una sola página se dibuja como esa
 * página (un «…» que esconde un solo número no ahorra nada).
 */
export function botonesDePagina(actual: number, totalPaginas: number, maximo = 7): BotonPagina[] {
  if (totalPaginas <= maximo) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  const mostrar = new Set<number>([1, totalPaginas, actual - 1, actual, actual + 1]);
  // Cerca de un extremo se muestran más páginas de ese lado para que la fila no cambie de largo al avanzar.
  if (actual <= 3) [2, 3, 4].forEach((n) => mostrar.add(n));
  if (actual >= totalPaginas - 2) [totalPaginas - 3, totalPaginas - 2, totalPaginas - 1].forEach((n) => mostrar.add(n));
  const ordenadas = [...mostrar].filter((n) => n >= 1 && n <= totalPaginas).sort((a, b) => a - b);
  const botones: BotonPagina[] = [];
  ordenadas.forEach((n, i) => {
    const anterior = ordenadas[i - 1];
    if (anterior !== undefined && n - anterior === 2) botones.push(n - 1);
    else if (anterior !== undefined && n - anterior > 2) botones.push("…");
    botones.push(n);
  });
  return botones;
}
