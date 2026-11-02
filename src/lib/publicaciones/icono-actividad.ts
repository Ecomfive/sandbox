// El ícono de cada cambio en la Actividad de una publicación de Gestión de IDs Dropi (pedido de Alcides, 28 oct 2026): el mismo de su botón
// (archivar, pausar, apagar, privatizar, republicar, liquidación, stock…) en lugar del punto gris, para ver de un vistazo qué pasó. Sale de la
// acción de la auditoría; sin base ni React, con prueba.

export type IconoActividad =
  | "archivar"
  | "pausar"
  | "reactivar"
  | "apagar"
  | "privatizar"
  | "republicar"
  | "liquidacion"
  | "stock"
  | "precio"
  | "editar"
  | "dropi"
  | "fotos"
  | "ia"
  | "vincular"
  | "recomendacion"
  | "tarea"
  | "crear"
  | "eliminar"
  | "deshacer"
  | "estado";

/** Qué ícono lleva una acción de la auditoría (`texto` es su línea ya armada: un «Editó» que cambió el precio lleva el del precio), o null para el punto. */
export function iconoDeAccion(accion: string, texto = ""): { icono: IconoActividad; error: boolean } | null {
  const error = /_(error|parcial)$/.test(accion);
  const de = (icono: IconoActividad) => ({ icono, error });
  if (/_cancelado$|^dropi_cambio_deshecho$/.test(accion)) return de("deshacer");
  if (/liquidacion/.test(accion)) return de("liquidacion");
  if (/^pausar_/.test(accion)) return de("pausar");
  if (/^reactivar_/.test(accion)) return de("reactivar");
  if (/apagar|apagado/.test(accion)) return de("apagar");
  if (/privatiz/.test(accion)) return de("privatizar");
  if (/republic/.test(accion)) return de("republicar");
  if (/archiv|restaur(ar|ada)_|_restaurada$/.test(accion) && accion !== "restaurar_nombre_dropi") return de("archivar");
  if (/stock/.test(accion)) return de("stock");
  if (/foto/.test(accion)) return de("fotos");
  if (/^ia_/.test(accion)) return de("ia");
  if (/vincular_sku/.test(accion)) return de("vincular");
  if (accion === "decidir_recomendacion_publicacion") return de("recomendacion");
  if (accion === "tarea_hecha_publicacion" || accion === "crear_tarea_publicacion" || accion === "resolver_tarea_publicacion") return de("tarea");
  if (/^eliminar_/.test(accion)) return de("eliminar");
  if (/^crear_|_crear_|^dropi_publicada$/.test(accion)) return de("crear");
  if (accion === "marcar_publicacion_duplicada") return de("estado");
  if (accion === "editar_publicacion_dropi" || accion === "dropi_descripcion_pendiente") return de(/precio/i.test(texto) ? "precio" : "editar");
  if (/(^|_)dropi(_|$)/.test(accion)) return de("dropi");
  return null;
}
