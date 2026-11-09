"use client";

import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import {
  comentarTarea,
  descartarSubidaComentarioTarea,
  editarComentarioTarea,
  eliminarComentarioTarea,
  obtenerActividadTarea,
  prepararSubidaComentarioTarea,
  reaccionarComentarioTarea,
} from "./tareas-actividad-actions";

const ACCIONES: AccionesActividad = {
  bucket: "publicaciones-dropi",
  comentar: comentarTarea,
  editar: editarComentarioTarea,
  eliminar: eliminarComentarioTarea,
  reaccionar: reaccionarComentarioTarea,
  prepararSubida: prepararSubidaComentarioTarea,
  descartarSubida: descartarSubidaComentarioTarea,
};

/** La Actividad de una tarea (8 nov 2026, pedido de Alcides), como la de Compras: comentarios con archivos, @menciones y lo que cambió. */
export function ActividadTarea({ id, puedeComentar, version }: { id: string; puedeComentar: boolean; version: number }) {
  return <Actividad id={id} obtener={obtenerActividadTarea} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} />;
}
