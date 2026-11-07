"use client";

import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad } from "@/lib/comentarios/tipos";
import {
  comentarProducto,
  descartarSubidaComentarioProducto,
  editarComentarioProducto,
  eliminarComentarioProducto,
  obtenerNotasProducto,
  prepararSubidaComentarioProducto,
  reaccionarComentarioProducto,
} from "./notas-producto-actions";

const ACCIONES: AccionesActividad = {
  bucket: "producto-notas",
  comentar: comentarProducto,
  editar: editarComentarioProducto,
  eliminar: eliminarComentarioProducto,
  reaccionar: reaccionarComentarioProducto,
  prepararSubida: prepararSubidaComentarioProducto,
  descartarSubida: descartarSubidaComentarioProducto,
};

/**
 * Las notas de un producto, al final de su ficha del inventario (7 nov 2026, pedido de Hernán): notas con archivos, @menciones,
 * respuestas y reacciones, y los cambios del producto (correcciones, estado, nombre…). Son del producto: se ven igual desde
 * Inventario y desde el Levantamiento, en todos los países.
 */
export function NotasProducto({ id, puedeComentar, version }: { id: string; puedeComentar: boolean; version: number }) {
  return <Actividad id={id} obtener={obtenerNotasProducto} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} placeholder="Escribe una nota… usa @ para etiquetar a alguien." />;
}
