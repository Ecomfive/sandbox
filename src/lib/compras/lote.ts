// Cambiar un dato de varias compras a la vez (la barra de selección de Compras). Lógica pura, sin base ni React: la usan la
// lista (para mostrar el cambio al instante) y la acción del servidor (que vuelve a calcular lo mismo y es la que manda).

/** Cuántas compras se pueden cambiar de una vez (una página de la lista trae 100). */
export const MAX_COMPRAS_LOTE = 300;

/**
 * Cómo se aplica el valor: `poner` lo deja igual en todas (etapa, estado, fecha, texto…); `agregar` y `quitar` solo sirven
 * para listas (las etiquetas) y respetan lo que cada compra ya tenía.
 */
export type ModoLote = "poner" | "agregar" | "quitar";

/** Etiquetas más que cabían en una compra (el mismo límite de `normalizarValor`). */
const MAX_ELEMENTOS = 30;

const igual = (a: string, b: string) => a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() === b.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * La lista de una compra después del cambio. `agregar` suma las que faltan (sin repetir, aunque cambie una mayúscula o un
 * acento: «Envío 1» y «envio 1» son la misma) y `quitar` saca las que estén. El orden que ya tenía se respeta.
 */
export function combinarLista(actuales: readonly string[], modo: ModoLote, valores: readonly string[]): string[] {
  if (modo === "poner") return [...new Set(valores)].slice(0, MAX_ELEMENTOS);
  if (modo === "quitar") return actuales.filter((a) => !valores.some((v) => igual(a, v)));
  const resultado = [...actuales];
  for (const v of valores) if (!resultado.some((a) => igual(a, v))) resultado.push(v);
  return resultado.slice(0, MAX_ELEMENTOS);
}

/** Si todas, algunas o ninguna de las compras tienen la etiqueta (para marcarla en el selector de la barra). */
export function presenciaEnLote(listas: readonly (readonly string[])[], valor: string): "todas" | "algunas" | "ninguna" {
  const con = listas.filter((l) => l.some((x) => igual(x, valor))).length;
  return con === 0 ? "ninguna" : con === listas.length ? "todas" : "algunas";
}

/** Las etapas con las que una compra se da por cerrada (se sella su fecha de cierre). */
export const ETAPAS_QUE_CIERRAN: readonly string[] = ["completado", "descartado"];

/**
 * Qué pasa con la fecha de cierre al cambiar la etapa: se sella al cerrar una compra abierta, se deja como estaba si ya
 * estaba cerrada y se quita al reabrirla (lo mismo que en la ficha y en la celda).
 */
export function cierreAlCambiarEtapa(etapaActual: string, etapaNueva: string): "sellar" | "mantener" | "quitar" {
  const cierra = ETAPAS_QUE_CIERRAN.includes(etapaNueva);
  if (!cierra) return "quitar";
  return ETAPAS_QUE_CIERRAN.includes(etapaActual) ? "mantener" : "sellar";
}
