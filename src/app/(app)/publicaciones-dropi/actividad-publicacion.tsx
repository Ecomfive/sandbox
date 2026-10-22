"use client";

import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import {
  comentarPublicacion,
  descartarSubidaComentarioPublicacion,
  editarComentarioPublicacion,
  eliminarComentarioPublicacion,
  obtenerActividadPublicacion,
  prepararSubidaComentarioPublicacion,
  reaccionarComentarioPublicacion,
} from "./actividad-actions";

const ACCIONES: AccionesActividad = {
  bucket: "publicaciones-dropi",
  comentar: comentarPublicacion,
  editar: editarComentarioPublicacion,
  eliminar: eliminarComentarioPublicacion,
  reaccionar: reaccionarComentarioPublicacion,
  prepararSubida: prepararSubidaComentarioPublicacion,
  descartarSubida: descartarSubidaComentarioPublicacion,
};

/**
 * La actividad de una publicación, al final de su ficha, como la de Compras: comentarios con archivos, @menciones, respuestas y
 * reacciones, y los cambios (precio, vínculo, decisiones de recomendaciones, tareas hechas) de la auditoría.
 */
export function ActividadPublicacion({ id, puedeComentar, version }: { id: string; puedeComentar: boolean; version: number }) {
  return <Actividad id={id} obtener={obtenerActividadPublicacion} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} />;
}
