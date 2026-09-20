// Atajos de filtro de la barra de herramientas: un botón que aplica un filtro de un toque (como el icono de
// persona de ClickUp para ver solo lo tuyo). Sin React, para poder probarlo.

import type { Filtro } from "./motor";

export interface AtajoFiltro {
  id: string;
  /** Lo que dice el botón al activarse: «Mis retiros». */
  etiqueta: string;
  /** Lo que explica el tooltip cuando está apagado: «Ver solo mis retiros». */
  ayuda: string;
  /** El filtro que aplica; es de selección (un campo y uno o más valores). */
  filtro: Filtro;
}

function valoresDe(filtro: Filtro): string[] | null {
  return filtro.valor.tipo === "seleccion" ? filtro.valor.valores : null;
}

/** El atajo está activo cuando el filtro de ese campo pide exactamente sus valores (en cualquier orden). */
export function atajoActivo(filtros: Filtro[], atajo: AtajoFiltro): boolean {
  const pedidos = valoresDe(atajo.filtro);
  if (!pedidos) return false;
  const actual = filtros.find((f) => f.campo === atajo.filtro.campo);
  const valores = actual ? valoresDe(actual) : null;
  if (!valores || valores.length !== pedidos.length) return false;
  return pedidos.every((v) => valores.includes(v));
}

/**
 * Enciende o apaga el atajo. Al apagarlo se quita el filtro de ese campo; al encenderlo reemplaza el que
 * hubiera en ese campo (si la persona había elegido a otra persona, por ejemplo) y no toca los demás.
 */
export function alternarAtajo(filtros: Filtro[], atajo: AtajoFiltro): Filtro[] {
  const otros = filtros.filter((f) => f.campo !== atajo.filtro.campo);
  return atajoActivo(filtros, atajo) ? otros : [...otros, atajo.filtro];
}
