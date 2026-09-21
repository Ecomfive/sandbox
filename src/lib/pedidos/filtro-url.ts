// El filtro de estados de Pedidos Dropi vive en la dirección (?estado=A&estado=B&alertas=1) para que la tabla traiga
// del servidor todas las órdenes de esos estados (solo trae 500) y para que se pueda compartir el enlace.
// Sin React, para poder probarlo.

/** Cuántos estados se aceptan a la vez (Dropi tiene unos 20; el resto se ignora). */
const MAX_ESTADOS = 30;

/** Los estados de la dirección: acepta uno, varios o ninguno; sin vacíos ni repetidos. */
export function estadosDeParametro(valor: string | string[] | undefined): string[] {
  const lista = Array.isArray(valor) ? valor : valor === undefined ? [] : [valor];
  return [...new Set(lista.map((e) => e.trim()).filter((e) => e !== ""))].slice(0, MAX_ESTADOS);
}

/** Suma el estado a los elegidos, o lo quita si ya estaba (pulsar de nuevo una tarjeta la apaga). */
export function alternarEstado(elegidos: string[], estado: string): string[] {
  return elegidos.includes(estado) ? elegidos.filter((e) => e !== estado) : [...elegidos, estado];
}

/**
 * El enlace de Pedidos con un filtro puesto. `conservar` son los parámetros que no son del filtro (período y orden);
 * los estados van repetidos (`estado=A&estado=B`) porque un nombre puede llevar comas.
 */
export function hrefPedidos(conservar: Record<string, string>, estados: string[], soloAlertas: boolean): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(conservar)) parametros.set(clave, valor);
  for (const estado of estados) parametros.append("estado", estado);
  if (soloAlertas) parametros.set("alertas", "1");
  const texto = parametros.toString();
  return texto ? `/pedidos-dropi?${texto}` : "/pedidos-dropi";
}

/** Lo que dice la franja «Tabla filtrada por …» y el menú de descarga. */
export function descripcionFiltro(estados: string[], soloAlertas: boolean): string {
  const partes = [...estados.map((e) => `«${e}»`)];
  if (soloAlertas) partes.push("liquidado sin marcar entregado");
  return partes.join(" + ");
}
