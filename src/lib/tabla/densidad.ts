// Densidad de las filas de las tablas: una preferencia de la persona, igual para todas las tablas.

export type Densidad = "comoda" | "compacta";

export const DENSIDADES: { valor: Densidad; etiqueta: string }[] = [
  { valor: "comoda", etiqueta: "Cómoda" },
  { valor: "compacta", etiqueta: "Compacta" },
];

/** Lo guardado en el navegador, o cómoda si no hay nada o es otra cosa. */
export function parsearDensidad(guardado: string): Densidad {
  return guardado === "compacta" ? "compacta" : "comoda";
}
