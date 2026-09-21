// Atajos de filtro: un toque que aplica un filtro (o varios juntos) — el botón «Mis retiros» de la barra de
// herramientas, o una tarjeta de resumen que filtra la tabla («Novedad», «Cerrados este mes»).
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
  /**
   * Modo «suma» (para un filtro de selección): el atajo agrega su valor a lo que ya se eligió en ese campo en vez de
   * reemplazarlo, así se pueden juntar varios estados («Abiertos» o «Con novedad»); pulsarlo de nuevo solo quita el suyo.
   * Es coherente porque una fila tiene un solo valor en el campo: juntar dos valores es «uno u otro».
   */
  suma?: boolean;
  /** Atajos compuestos que no se combinan con éste: si alguno está activo se apaga antes de encender éste. */
  excluye?: AtajoFiltro[];
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

/** Los valores que ya hay elegidos en un campo de selección (vacío si no hay filtro o no es de selección). */
function valoresElegidos(filtros: Filtro[], campo: string): string[] {
  const actual = filtros.find((f) => f.campo === campo);
  return actual && actual.valor.tipo === "seleccion" ? actual.valor.valores : [];
}

/** Un atajo «suma» solo tiene sentido sobre un filtro de selección: devuelve sus valores. */
function valoresQueSuma(atajo: AtajoFiltro): string[] | null {
  return atajo.suma && atajo.filtro.valor.tipo === "seleccion" ? atajo.filtro.valor.valores : null;
}

/**
 * El atajo está activo cuando cada uno de sus filtros está puesto (los de otros campos no importan). Un atajo «suma»
 * está activo mientras su valor esté entre los elegidos del campo, aunque haya otros junto a él.
 */
export function atajoActivo(filtros: Filtro[], atajo: AtajoFiltro): boolean {
  const suma = valoresQueSuma(atajo);
  const principal = suma
    ? suma.every((v) => valoresElegidos(filtros, atajo.filtro.campo).includes(v))
    : filtros.some((f) => mismoFiltro(f, atajo.filtro));
  return principal && (atajo.ademas ?? []).every((pedido) => filtros.some((f) => mismoFiltro(f, pedido)));
}

/**
 * Enciende o apaga el atajo. Al apagarlo se quitan los filtros de sus campos; al encenderlo reemplazan los que
 * hubiera en esos campos (si la persona había elegido a otra persona, por ejemplo) y no se tocan los demás.
 *
 * En modo «suma» agrega o quita solo su valor. Al quitar el último valor, el campo queda sin filtro y se van también
 * los filtros que el atajo traía de más (`ademas`): la tabla queda sin filtrar. Antes de encender se apagan los
 * atajos que `excluye` (los compuestos, que no se combinan con otros estados).
 */
export function alternarAtajo(filtros: Filtro[], atajo: AtajoFiltro): Filtro[] {
  const suma = valoresQueSuma(atajo);
  if (suma) {
    const base = (atajo.excluye ?? []).reduce(
      (actuales, otro) => (atajoActivo(actuales, otro) ? alternarAtajo(actuales, otro) : actuales),
      filtros
    );
    const campo = atajo.filtro.campo;
    const elegidos = valoresElegidos(base, campo);
    const extras = atajo.ademas ?? [];
    const camposExtras = new Set(extras.map((f) => f.campo));
    const sinElCampo = base.filter((f) => f.campo !== campo);
    if (suma.every((v) => elegidos.includes(v))) {
      const restantes = elegidos.filter((v) => !suma.includes(v));
      return restantes.length > 0
        ? [...sinElCampo, { campo, valor: { tipo: "seleccion", valores: restantes } }]
        : sinElCampo.filter((f) => !camposExtras.has(f.campo));
    }
    const nuevos = [...new Set([...elegidos, ...suma])];
    return [
      ...sinElCampo.filter((f) => !camposExtras.has(f.campo)),
      ...extras,
      { campo, valor: { tipo: "seleccion", valores: nuevos } },
    ];
  }
  const suyos = todosLosFiltros(atajo);
  const campos = new Set(suyos.map((f) => f.campo));
  const otros = filtros.filter((f) => !campos.has(f.campo));
  return atajoActivo(filtros, atajo) ? otros : [...otros, ...suyos];
}
