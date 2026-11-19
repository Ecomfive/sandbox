// Productos defectuosos en el inventario (19 nov 2026, pedido de Dinora vía Jhokser: «¿hay una sección para agregar a defectuoso, en vez de solo restar?»). Un producto defectuoso sigue
// físicamente en la bodega pero no se puede vender: es la cubeta «dañado» (`wms_stock.danado`), que ya resta del disponible y sale en «Fuera de venta». Tres acciones, todas sobre una bodega
// propia y con el motivo escrito (queda en el historial del producto):
//   * marcar:   pasa unidades del disponible a defectuoso (el físico no cambia, el disponible baja);
//   * devolver: las unidades defectuosas vuelven a disponible (se revisaron y estaban bien, o se repararon);
//   * baja:     las unidades defectuosas salen del inventario (físico y defectuoso bajan): se botaron, se devolvieron al proveedor… Es una salida, así que donde la salida a mano está
//               restringida (Costa Rica) solo la hace quien puede.
// Lógica pura, con su prueba; la base lo vuelve a comprobar (`wms_marcar_danado`).

export type AccionDefectuoso = "marcar" | "devolver" | "baja";

export const ACCIONES_DEFECTUOSO: AccionDefectuoso[] = ["marcar", "devolver", "baja"];

export const ETIQUETA_ACCION_DEFECTUOSO: Record<AccionDefectuoso, string> = {
  marcar: "Marcar como defectuoso",
  devolver: "Volver a disponible",
  baja: "Dar de baja",
};

/** Qué pasa con las unidades, dicho en una frase para mostrar antes de guardar. */
export const EFECTO_ACCION_DEFECTUOSO: Record<AccionDefectuoso, string> = {
  marcar: "Dejan de estar disponibles para vender. Siguen en la bodega.",
  devolver: "Vuelven a estar disponibles para vender.",
  baja: "Salen del inventario (se botan, se devuelven al proveedor…).",
};

export const MAX_MOTIVO_DEFECTUOSO = 300;
const MAX_CANTIDAD = 1_000_000;

export interface EntradaDefectuoso {
  accion: unknown;
  cantidad: unknown;
  motivo: unknown;
  /** Lo que hay disponible y lo que hay marcado como defectuoso en esa bodega ahora. */
  disponible: number;
  danado: number;
}

/** Revisa lo que se va a hacer y devuelve los datos limpios, o el primer error en palabras. */
export function revisarDefectuoso(e: EntradaDefectuoso): { accion: AccionDefectuoso; cantidad: number; motivo: string } | { error: string } {
  if (!ACCIONES_DEFECTUOSO.includes(e.accion as AccionDefectuoso)) return { error: "Elige qué vas a hacer con las unidades." };
  const accion = e.accion as AccionDefectuoso;
  const texto = typeof e.cantidad === "string" ? e.cantidad.trim() : e.cantidad;
  const cantidad = texto === "" || texto === null || texto === undefined ? NaN : Number(texto);
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD) return { error: "Escribe cuántas unidades: un número entero mayor que cero." };
  const motivo = typeof e.motivo === "string" ? e.motivo.trim().slice(0, MAX_MOTIVO_DEFECTUOSO) : "";
  if (motivo.length < 3) return { error: accion === "marcar" ? "Escribe qué tiene de defectuoso." : "Escribe el motivo." };
  if (accion === "marcar") {
    if (cantidad > Math.max(e.disponible, 0)) return { error: e.disponible > 0 ? `Solo hay ${e.disponible.toLocaleString("es-PA")} ${e.disponible === 1 ? "unidad disponible" : "unidades disponibles"} en esa bodega.` : "No hay unidades disponibles en esa bodega." };
  } else if (cantidad > Math.max(e.danado, 0)) {
    return { error: e.danado > 0 ? `Solo hay ${e.danado.toLocaleString("es-PA")} ${e.danado === 1 ? "unidad defectuosa" : "unidades defectuosas"} en esa bodega.` : "No hay unidades defectuosas en esa bodega." };
  }
  return { accion, cantidad, motivo };
}
