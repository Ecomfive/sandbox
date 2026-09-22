"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearPlataformaPanel } from "./crear-plataforma-panel";
import { DEF_PLATAFORMAS, type FilaPlataforma } from "./def-plataformas";
import { DisponibleToggle } from "./disponible-toggle";

const NOMBRE: NombreFilas = { singular: "plataforma", plural: "plataformas" };
const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, nombre: TiendaIcon };

const COLUMNAS: ColumnaTabla<FilaPlataforma>[] = [
  { id: "nombre", label: "Plataforma", ocultable: false, clase: "font-medium", render: (p) => p.nombre },
  { id: "estado", label: "Estado", ocultable: true, render: (p) => <DisponibleToggle id={p.id} disponible={p.disponible} /> },
];

/** Plataformas del país con la barra de herramientas común (agrupar por estado, ocultas, filtros y «Agregar»). */
export function TablaPlataformas({
  plataformas,
  paisId,
  puedeEscribir,
}: {
  plataformas: FilaPlataforma[];
  paisId: string;
  puedeEscribir: boolean;
}) {
  return (
    <TablaDatos
      def={DEF_PLATAFORMAS}
      filas={plataformas}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      accionPrincipal={puedeEscribir ? <CrearPlataformaPanel paisId={paisId} /> : undefined}
      anchoMinimo="24rem"
      ariaLabel="Plataformas para crear retiros"
      vacio="Este país no tiene plataformas registradas."
    />
  );
}
