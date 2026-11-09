"use client";

import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import { REGLAS_ID } from "@/lib/publicaciones/reglas";
import {
  comentarReglas,
  descartarSubidaComentarioReglas,
  editarComentarioReglas,
  eliminarComentarioReglas,
  obtenerActividadReglas,
  prepararSubidaComentarioReglas,
  reaccionarComentarioReglas,
} from "./actividad-reglas-actions";

const ACCIONES: AccionesActividad = {
  bucket: "publicaciones-dropi",
  comentar: comentarReglas,
  editar: editarComentarioReglas,
  eliminar: eliminarComentarioReglas,
  reaccionar: reaccionarComentarioReglas,
  prepararSubida: prepararSubidaComentarioReglas,
  descartarSubida: descartarSubidaComentarioReglas,
};

/**
 * La Actividad de la pestaña Reglas (8 nov 2026, pedido de Alcides), como la de Compras: quién cambió qué regla (de cuánto a cuánto), las indicaciones para
 * la IA y las imágenes modelo, y los comentarios del equipo con archivos, respuestas, reacciones y @menciones. `version` la vuelve a pedir al guardar.
 */
export function ActividadReglas({ puedeComentar, version }: { puedeComentar: boolean; version: number }) {
  return <Actividad id={REGLAS_ID} obtener={obtenerActividadReglas} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} />;
}
