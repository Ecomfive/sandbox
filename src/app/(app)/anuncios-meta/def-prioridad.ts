import { NOMBRE_PRIORIDAD, type Pendiente } from "@/lib/meta-ads/prioridad";
import { PRIORIDADES } from "@/lib/meta-ads/sugerencias";
import type { CampoDef } from "@/lib/tabla/motor";

const NADA = "nada";
/** Las prioridades que puede tener una fila de una lista («Del historial» no es de una fila). */
const DE_FILA = PRIORIDADES.filter((p) => p !== "historial");

/** El campo «Prioridad» de las listas de Anuncios Meta: se filtra y se agrupa por él, de lo más urgente a lo que no tiene nada pendiente. */
export function campoPrioridad<F>(de: (fila: F) => Pendiente | null | undefined): CampoDef<F> {
  return {
    id: "prioridad",
    etiqueta: "Prioridad",
    tipo: "seleccion",
    valores: (f) => [de(f)?.prioridad ?? NADA],
    opciones: () => [...DE_FILA.map((p) => ({ valor: p, etiqueta: NOMBRE_PRIORIDAD[p] })), { valor: NADA, etiqueta: "Sin pendientes" }],
    agrupable: true,
    ordenGrupos: [...DE_FILA, NADA],
  };
}
