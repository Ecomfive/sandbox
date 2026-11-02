"use client";

import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import {
  comentarDropshipper,
  descartarSubidaComentarioDropshipper,
  editarComentarioDropshipper,
  eliminarComentarioDropshipper,
  obtenerActividadDropshipper,
  prepararSubidaComentarioDropshipper,
  reaccionarComentarioDropshipper,
} from "./actividad-dropshipper-actions";

const ACCIONES: AccionesActividad = {
  bucket: "crm-dropshippers",
  comentar: comentarDropshipper,
  editar: editarComentarioDropshipper,
  eliminar: eliminarComentarioDropshipper,
  reaccionar: reaccionarComentarioDropshipper,
  prepararSubida: prepararSubidaComentarioDropshipper,
  descartarSubida: descartarSubidaComentarioDropshipper,
};

/**
 * La actividad de un dropshipper (29 oct 2026), como la de Compras: comentarios con archivos, @menciones, respuestas y reacciones, y los
 * cambios de siempre (notas, casos, seguimientos, auditoría) filtrados por área. Va en la ficha del CRM y en la del chat de la bandeja.
 */
export function ActividadDropshipper({ id, puedeComentar, version }: { id: string; puedeComentar: boolean; version: number }) {
  return <Actividad id={id} obtener={obtenerActividadDropshipper} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} />;
}
