"use client";

import { ListaDatos } from "@/components/tabla/lista-datos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EstadoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_PUBLICACIONES_DROP, type FilaPublicacionDrop } from "./def-publicaciones-drop";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = { nombre: ProductoIcon, estado: EstadoIcon };

/** La lista de publicaciones de Drop: la misma barra de herramientas que la de Dropi, sin filas hasta que se conecten los datos. */
export function ListaPublicacionesDrop({ publicaciones }: { publicaciones: FilaPublicacionDrop[] }) {
  return (
    <ListaDatos
      def={DEF_PUBLICACIONES_DROP}
      filas={publicaciones}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      variante="filas"
      renderFila={(f) => <div className="px-4 py-3 text-sm font-medium">{f.nombre}</div>}
      vacio="Todavía no hay publicaciones de Drop."
    />
  );
}
