"use client";

import type { ComponentType } from "react";
import { Actividad } from "@/components/actividad/actividad";
import type { AccionesActividad, EventoActividad } from "@/lib/comentarios/tipos";
import {
  ActualizarIcon,
  ApagarIcon,
  ArchivarIcon,
  CandadoIcon,
  CheckIcon,
  DeshacerIcon,
  DropiIcon,
  EnlaceIcon,
  EstadoIcon,
  EtiquetaIcon,
  FotosIcon,
  InteligenciaIcon,
  InventarioIcon,
  LapizIcon,
  MargenIcon,
  PapeleraIcon,
  PausaIcon,
  ReactivarIcon,
  SugerenciaIcon,
  TiendaIcon,
} from "@/lib/nav-icons";
import { iconoDeAccion, type IconoActividad } from "@/lib/publicaciones/icono-actividad";
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

/** Los mismos íconos de los botones de la fila y la ficha. */
const ICONOS: Record<IconoActividad, ComponentType<{ className?: string }>> = {
  archivar: ArchivarIcon,
  pausar: PausaIcon,
  reactivar: ReactivarIcon,
  apagar: ApagarIcon,
  privatizar: CandadoIcon,
  republicar: ActualizarIcon,
  liquidacion: EtiquetaIcon,
  stock: InventarioIcon,
  precio: MargenIcon,
  editar: LapizIcon,
  dropi: DropiIcon,
  fotos: FotosIcon,
  ia: InteligenciaIcon,
  vincular: EnlaceIcon,
  recomendacion: SugerenciaIcon,
  tarea: CheckIcon,
  crear: TiendaIcon,
  eliminar: PapeleraIcon,
  deshacer: DeshacerIcon,
  estado: EstadoIcon,
};

/**
 * El ícono de cada cambio (pedido de Alcides, 28 oct 2026): el de su acción en lugar del punto gris, en rojo si falló. Lo que no tiene ícono
 * lleva el punto, en una caja del mismo ancho para que todas las líneas queden alineadas. Es decorativo: el texto ya dice qué pasó.
 */
function iconoCambio(e: EventoActividad) {
  const i = iconoDeAccion(e.campo, e.texto ?? "");
  const Icono = i ? ICONOS[i.icono] : null;
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
      {Icono ? <Icono className={`h-3.5 w-3.5 ${i!.error ? "text-destructive" : "text-muted-foreground"}`} /> : <span className="h-1.5 w-1.5 rounded-full bg-border-control" />}
    </span>
  );
}

/**
 * La actividad de una publicación, al final de su ficha, como la de Compras: comentarios con archivos, @menciones, respuestas y
 * reacciones, y los cambios (precio, vínculo, decisiones de recomendaciones, tareas hechas) de la auditoría.
 */
export function ActividadPublicacion({ id, puedeComentar, version }: { id: string; puedeComentar: boolean; version: number }) {
  return <Actividad id={id} obtener={obtenerActividadPublicacion} acciones={ACCIONES} puedeComentar={puedeComentar} version={version} iconoCambio={iconoCambio} />;
}
