// Gestión de IDs Drop: lo que se puede hacer con una publicación de Drop (3 nov 2026, pedido de Hernán). Drop no es igual que Dropi, así que las acciones de la fila son otras:
//   * No se republica, no se pausa y no se archiva (Drop no lo tiene): **no hay botón** (3 nov 2026, pedido de Hernán: lo que Drop no usa no se dibuja, ni apagado).
//   * «Apagar» se llama **inactivar**: una publicación inactiva se vuelve a **activar** con el mismo botón.
//   * Lo que sobra solo se **elimina**.
//   * «En liquidación» queda como botón **pendiente**: Drop todavía no lo usa y se ve si se necesita.
//   * El stock **no se edita**: un producto nace en cero y el stock entra con una **solicitud de ingreso de inventario** que la bodega aprueba o declina («Gestionar inventario»).
//   * **No hay producto privado aparte**: se le da **acceso** al producto desde el mismo ID, con el correo del cliente y su precio (el mismo u otro).
// Todo está explicado en DROP-REFERENCIA.md.
// Un botón de Drop que hoy no se puede usar (sin ID, por ejemplo) va apagado y dice por qué; uno que Drop no tiene no está. Los que están **pendientes** de ver si Drop los usa
// (liquidación, tareas) se dejan a la vista, apagados (`MOTIVOS_PENDIENTES_DROP`). Sin base ni React, con prueba (acciones.test.ts).

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

/** Por qué no se puede pedir un ingreso de inventario; `null` = se puede. */
export function motivoGestionarInventario(e: EstadoBotonesDrop): string | null {
  return e.idDrop.trim() ? null : "Sin ID de Drop";
}

/** Por qué no se puede dar acceso privado; `null` = se puede. */
export function motivoAccesoPrivado(e: EstadoBotonesDrop): string | null {
  return e.idDrop.trim() ? null : "Sin ID de Drop";
}

/** Lo que se escribe al pedir un ingreso de inventario: cuántas unidades se mandan a la bodega. */
export function validarSolicitudIngreso(unidades: unknown): { error: string } | { unidades: number } {
  const n = Number(unidades);
  if (!Number.isInteger(n) || n < 1) return { error: "Escribe cuántas unidades se mandan (un número entero de 1 en adelante)." };
  return { unidades: n };
}

/**
 * Lo que se escribe al dar acceso privado (confirmado por Nicole, 3 nov 2026): el producto se hace privado para un dropshipper —mismo ID y mismo SKU— y se **aparta una cantidad de unidades solo para él**.
 * Se pide el correo del cliente, las unidades a apartar (entero de 1 en adelante, sin pasar de las que hay si se conocen) y, opcional, su precio de venta (sin precio, el mismo de la publicación: `precio: null`).
 */
export function validarAccesoPrivado(
  correo: string,
  precio: unknown,
  unidades: unknown,
  disponibles: number | null = null,
): { error: string } | { correo: string; precio: number | null; unidades: number } {
  const c = correo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return { error: "Escribe el correo del cliente." };
  const u = Number(unidades);
  if (String(unidades ?? "").trim() === "" || !Number.isInteger(u) || u < 1) return { error: "Escribe cuántas unidades se apartan para este cliente (un número entero de 1 en adelante)." };
  if (disponibles !== null && u > disponibles) return { error: `Solo hay ${disponibles} unidades en Drop: no se pueden apartar ${u}.` };
  if (precio === null || precio === undefined || String(precio).trim() === "") return { correo: c, precio: null, unidades: u };
  const n = Number(precio);
  if (!Number.isFinite(n) || n <= 0) return { error: "El precio debe ser mayor a cero (o déjalo vacío para usar el mismo)." };
  return { correo: c, precio: n, unidades: u };
}

/** El botón de liquidación queda como pendiente: se deja a la vista para ver si Drop lo usa. */
export const MOTIVO_LIQUIDACION_DROP = "Pendiente: todavía no se usa en Drop";
export const motivoLiquidacion = (): string => MOTIVO_LIQUIDACION_DROP;

/** Los botones que quedan pendientes (todavía no se sabe si Drop los usa): se dejan a la vista, apagados, con su porqué. */
export const MOTIVOS_PENDIENTES_DROP = {
  tareas: "Pendiente: todavía sin tareas en Drop",
} as const;

/** Las acciones de la fila de Drop, en el orden en que se dibujan: las de Dropi que Drop sí tiene (acceso privado, inactivar o activar, liquidación), «Gestionar inventario» después del acceso privado, «Eliminar» y «Tareas» (pendiente). No están republicar, pausar ni archivar. */
export const ACCIONES_FILA_DROP = ["privatizar", "inventario", "estado", "liquidacion", "eliminar", "tareas"] as const;
