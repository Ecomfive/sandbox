"use client";

import { BotonIconoFila } from "@/app/(app)/publicaciones-dropi/boton-icono-fila";
import { useToast } from "@/components/ui/toast";
import { ApagarIcon, EtiquetaIcon, PapeleraIcon, ReactivarIcon } from "@/lib/nav-icons";
import { accionDeEstado, ETIQUETA_ESTADO_DROP, motivoCambioEstado, motivoEliminar, motivoLiquidacion } from "@/lib/publicaciones-drop/acciones";
import type { FilaPublicacionDrop } from "./def-publicaciones-drop";

const AVISO_SIN_CONEXION = "Todavía no está conectado con Drop: esta acción se activa cuando se sincronicen las publicaciones.";

/**
 * Una publicación de Drop como fila de la lista, con los botones de Drop (3 nov 2026): inactivar o activar, liquidación (pendiente) y eliminar. No hay «Republicar» ni
 * «Archivar» como en Dropi. Los botones no se esconden: si no se pueden usar van apagados y dicen por qué. Por ahora no hay datos ni conexión, así que pulsarlos solo avisa.
 */
export function FilaPublicacionDropLista({ f }: { f: FilaPublicacionDrop }) {
  const { mostrarToast } = useToast();
  const estado = { estado: f.estado, idDrop: f.idDrop };
  const cambio = accionDeEstado(estado);
  const aviso = () => mostrarToast(AVISO_SIN_CONEXION);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {f.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.fotoUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{f.nombre}</span>
        <span className="truncate text-xs text-muted-foreground">
          SKU de Drop: {f.skuDrop || "—"} · {f.producto ? `vinculado a ${f.producto.codigo}` : "sin vincular a un producto"} · {ETIQUETA_ESTADO_DROP[f.estado]}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <BotonIconoFila
          texto={cambio.texto}
          motivo={motivoCambioEstado(estado)}
          icono={cambio.accion === "inactivar" ? ApagarIcon : ReactivarIcon}
          nombre={f.nombre}
          onClick={aviso}
          activo={cambio.accion === "activar" ? "azul" : undefined}
        />
        <BotonIconoFila texto="Poner en liquidación" motivo={motivoLiquidacion()} icono={EtiquetaIcon} nombre={f.nombre} onClick={aviso} />
        <BotonIconoFila
          texto="Eliminar publicación"
          motivo={motivoEliminar(estado)}
          icono={PapeleraIcon}
          nombre={f.nombre}
          onClick={aviso}
          clase="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
        />
      </div>
    </div>
  );
}
