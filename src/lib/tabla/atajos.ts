// Atajos de filtro: un toque que aplica un filtro (o varios juntos) — el botón «Mis retiros» de la barra de
// herramientas, o una tarjeta de resumen que filtra la tabla («Novedad», «Alimentación de este mes»).
// Sin React, para poder probarlo.

import type { Filtro } from "./motor";

export interface AtajoFiltro {
  id: string;
  /** Lo que dice el botón al activarse: «Mis retiros». */
  etiqueta: string;
  /** Lo que explica el tooltip cuando está apagado: «Ver solo mis retiros». */
  ayuda: string;
  /** El filtro que aplica (un campo de selección o de fechas); da también el ícono del botón. */
  filtro: Filtro;
  /** Filtros que van con él, de otros campos: la tarjeta «Cerrados este mes» pide cerrado Y el mes. */
  ademas?: Filtro[];
}

/** Dos filtros piden lo mismo: mismo campo y mismos valores (en cualquier orden) o mismas fechas. */
function mismoFiltro(a: Filtro, b: Filtro): boolean {
  if (a.campo !== b.campo) return false;
  const x = a.valor;
  const y = b.valor;
  if (x.tipo === "seleccion" && y.tipo === "seleccion") {
    return x.valores.length === y.valores.length && x.valores.every((v) => y.valores.includes(v));
  }
  if (x.tipo === "fecha" && y.tipo === "fecha") return x.desde === y.desde && x.hasta === y.hasta;
  return JSON.stringify(x) === JSON.stringify(y);
}

const todosLosFiltros = (atajo: AtajoFiltro): Filtro[] => [atajo.filtro, ...(atajo.ademas ?? [])];

/** El atajo está activo cuando cada uno de sus filtros está puesto tal cual (los de otros campos no importan). */
export function atajoActivo(filtros: Filtro[], atajo: AtajoFiltro): boolean {
  return todosLosFiltros(atajo).every((pedido) => filtros.some((f) => mismoFiltro(f, pedido)));
}

/**
 * Enciende o apaga el atajo. Al apagarlo se quitan los filtros de sus campos; al encenderlo reemplazan los que
 * hubiera en esos campos (si la persona había elegido a otra persona, por ejemplo) y no se tocan los demás.
 */
export function alternarAtajo(filtros: Filtro[], atajo: AtajoFiltro): Filtro[] {
  const suyos = todosLosFiltros(atajo);
  const campos = new Set(suyos.map((f) => f.campo));
  const otros = filtros.filter((f) => !campos.has(f.campo));
  return atajoActivo(filtros, atajo) ? otros : [...otros, ...suyos];
}
