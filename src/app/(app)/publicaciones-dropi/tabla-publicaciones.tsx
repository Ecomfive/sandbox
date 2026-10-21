"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { ESTADOS, ESTADOS_PUBLICACION, ESTADOS_REPOSICION, ESTADOS_VENTA, TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, DEF_PUBLICACIONES_ADMIN, type FilaPublicacion } from "./def-publicaciones";
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
  stockDropi: InventarioIcon,
  ventaDropi: MargenIcon,
  ventaCoincide: MargenIcon,
  netas30: MargenIcon,
  stockDropiNum: InventarioIcon,
  diasInventario: CalendarioIcon,
};

const COLOR_GRUPO: Record<string, OpcionPublicacion[]> = { estado: ESTADOS, venta: ESTADOS_VENTA, ventaDropi: ESTADOS_VENTA, ubicacion: UBICACIONES, reposicion: ESTADOS_REPOSICION, tipo: TIPOS, publicacion: ESTADOS_PUBLICACION };

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
  corteVentas,
}: {
  publicaciones: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  personas: Persona[];
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
  /** Hasta qué día llegan las ventas de Dropi; `null` si no se muestran (solo las ve un administrador). */
  corteVentas: string | null;
}) {
  const verVentas = corteVentas !== null;
  const def = verVentas ? DEF_PUBLICACIONES_ADMIN : DEF_PUBLICACIONES;
  // La ficha abierta también queda en la dirección (`?abrir=<id>`): si la lista se vuelve a cargar (al guardar), sigue abierta.
  const params = useSearchParams();
  const [abierta, setAbierta] = useState<string | null>(() => params.get("abrir"));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierta) url.searchParams.set("abrir", abierta);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierta]);
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  return (
    <ProveedorSkusMaestros opciones={opcionesSku}>
      <TableroAcciones publicaciones={publicaciones} def={def} />
      <ListaDatos
        def={def}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        renderFila={(f, enOrden) => (
          <FilaPublicacionLista
            f={f}
            verVentas={verVentas}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
            alEliminar={puedeEliminar ? () => setAbierta((a) => (a === f.id ? null : a)) : undefined}
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
        corteVentas={corteVentas}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </ProveedorSkusMaestros>
  );
}
