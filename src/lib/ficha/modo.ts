// Cómo se abre una ficha (como las vistas de una tarea de ClickUp): en una barra lateral, en un cuadro de diálogo al centro o a
// pantalla completa. Cada persona elige uno y vale para todas las fichas del sistema; mientras no elija, cada ficha se abre como
// siempre (el panel a la derecha, y la de Producto al centro). Lógica pura, con su prueba.

export const MODOS_FICHA = ["lateral", "centro", "completa"] as const;
export type ModoFicha = (typeof MODOS_FICHA)[number];

/** Lo que dice cada opción del selector (los nombres de ClickUp). */
export const ETIQUETA_MODO: Record<ModoFicha, string> = {
  lateral: "Barra lateral",
  centro: "Cuadro de diálogo",
  completa: "Pantalla completa",
};

/** Lo que se guardó en el navegador, si es un modo válido; si no (vacío, un valor viejo o roto), ninguna elección. */
export function leerModoFicha(guardado: string | null | undefined): ModoFicha | null {
  return (MODOS_FICHA as readonly string[]).includes(guardado ?? "") ? (guardado as ModoFicha) : null;
}

/** Cómo se abre una ficha que no depende de la elección de la persona: el panel a la derecha, o al centro si es la grande. */
export function modoPorDefecto(lado: "centro" | "derecha"): ModoFicha {
  return lado === "derecha" ? "lateral" : "centro";
}

/** El modo con que se abre una ficha: el que eligió la persona o, sin elección, el suyo por defecto. */
export function modoEfectivo(guardado: string | null | undefined, lado: "centro" | "derecha"): ModoFicha {
  return leerModoFicha(guardado) ?? modoPorDefecto(lado);
}

/** Una ventana es una ficha (y deja elegir cómo se abre) si es un panel a la derecha o la ventana grande al centro. */
export const esFicha = (lado: "centro" | "derecha", ancho: "sm" | "md" | "lg" | "xl") => lado === "derecha" || ancho === "xl";
