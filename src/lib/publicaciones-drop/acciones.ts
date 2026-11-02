// Gestión de IDs Drop: lo que se puede hacer con una publicación de Drop (3 nov 2026, pedido de Hernán). Drop no es igual que Dropi, así que las acciones de la fila son otras:
//   * No se republica (Drop no lo tiene): no hay botón.
//   * «Apagar» se llama **inactivar**: una publicación inactiva se vuelve a **activar** con el mismo botón.
//   * No se archiva: solo se **elimina**.
//   * «En liquidación» queda como botón **pendiente**: Drop todavía no lo usa y se ve si se necesita.
// Como en Dropi, un botón no se esconde: si no se puede usar va apagado y dice por qué. Sin base ni React, con prueba (acciones.test.ts).

export type EstadoDrop = "activo" | "inactivo";

export const ETIQUETA_ESTADO_DROP: Record<EstadoDrop, string> = { activo: "Activa", inactivo: "Inactiva" };

export interface EstadoBotonesDrop {
  estado: EstadoDrop;
  /** El ID de la publicación en Drop; vacío mientras no se haya conectado. */
  idDrop: string;
}

/** El botón de inactivar o activar: lo que hace según el estado de ahora. */
export function accionDeEstado(e: Pick<EstadoBotonesDrop, "estado">): { accion: "inactivar" | "activar"; texto: string } {
  return e.estado === "activo" ? { accion: "inactivar", texto: "Inactivar publicación" } : { accion: "activar", texto: "Activar publicación" };
}

/** Por qué no se puede inactivar ni activar ahora; `null` = se puede. */
export function motivoCambioEstado(e: EstadoBotonesDrop): string | null {
  return e.idDrop.trim() ? null : "Sin ID de Drop";
}

/** Por qué no se puede eliminar; `null` = se puede. */
export function motivoEliminar(e: EstadoBotonesDrop): string | null {
  return e.idDrop.trim() ? null : "Sin ID de Drop";
}

/** El botón de liquidación queda como pendiente: se deja a la vista para ver si Drop lo usa. */
export const MOTIVO_LIQUIDACION_DROP = "Pendiente: todavía no se usa en Drop";
export const motivoLiquidacion = (): string => MOTIVO_LIQUIDACION_DROP;

/** Las acciones de la fila de Drop, en el orden en que se dibujan: lo que no existe en Drop (republicar, archivar) no está. */
export const ACCIONES_FILA_DROP = ["estado", "liquidacion", "eliminar"] as const;
