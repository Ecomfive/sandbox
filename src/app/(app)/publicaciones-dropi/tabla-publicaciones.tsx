"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { ESTADOS, ESTADOS_PUBLICACION, ESTADOS_REPOSICION, ESTADOS_VENTA, TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, type FilaPublicacion } from "./def-publicaciones";
import { FichaPublicacion, type Persona } from "./ficha-publicacion";
import { FilaPublicacionLista } from "./fila-publicacion";
import { TableroAcciones } from "./tablero-acciones";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  revision: CalendarioIcon,
  venta: MargenIcon,
  ubicacion: InventarioIcon,
  reposicion: InventarioIcon,
  tipo: EstadoIcon,
  publicacion: EstadoIcon,
  privatizado: PersonaIcon,
  responsable: PersonaIcon,
  competencia: EstadoIcon,
  vinculo: ProductoIcon,
  nombre: ProductoIcon,
  precio: MargenIcon,
  margen: MargenIcon,
  margenBajo: MargenIcon,
  ultimaRevision: CalendarioIcon,
  proximaRevision: CalendarioIcon,
  fechaPublicacion: CalendarioIcon,
};

const COLOR_GRUPO: Record<string, OpcionPublicacion[]> = { estado: ESTADOS, venta: ESTADOS_VENTA, ubicacion: UBICACIONES, reposicion: ESTADOS_REPOSICION, tipo: TIPOS, publicacion: ESTADOS_PUBLICACION };

/**
 * Las publicaciones del país: el tablero de acciones arriba y, debajo, la lista de filas con la barra de herramientas común y
 * «Agregar». Toda la fila abre la ficha, con flechas para pasar a la anterior y la siguiente.
 */
export function TablaPublicaciones({
  publicaciones,
  opcionesSku,
  personas,
  paisId,
  codigoPais,
  puedeEscribir,
  puedeEliminar,
}: {
  publicaciones: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  personas: Persona[];
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  return (
    <ProveedorSkusMaestros opciones={opcionesSku}>
      <TableroAcciones publicaciones={publicaciones} />
      <ListaDatos
        def={DEF_PUBLICACIONES}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        renderFila={(f, enOrden) => (
          <FilaPublicacionLista
            f={f}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
          />
        )}
        etiquetaGrupo={(campo, grupo) => {
          const o = COLOR_GRUPO[campo] && grupo.clave !== SIN_VALOR ? opcion(COLOR_GRUPO[campo], grupo.clave) : null;
          return o ? <Badge color={o.color}>{o.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>;
        }}
        accionPrincipal={puedeEscribir ? <CrearPublicacionPanel paisId={paisId} personas={personas} /> : undefined}
        vacio="Todavía no hay publicaciones en este país."
      />
      <FichaPublicacion
        publicacion={publicaciones.find((p) => p.id === abierta)}
        personas={personas}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        puedeEliminar={puedeEliminar}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </ProveedorSkusMaestros>
  );
}
