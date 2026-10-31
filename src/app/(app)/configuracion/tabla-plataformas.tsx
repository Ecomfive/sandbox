"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, InventarioIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CeldaFulfillment } from "./celda-fulfillment";
import { CrearPlataformaPanel } from "./crear-plataforma-panel";
import { DEF_PLATAFORMAS, type FilaPlataforma } from "./def-plataformas";
import { DisponibleToggle } from "./disponible-toggle";

const NOMBRE: NombreFilas = { singular: "plataforma", plural: "plataformas" };
const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, nombre: TiendaIcon, fulfillment: InventarioIcon };

const columnas = (nombrePais: string, puedeEscribir: boolean): ColumnaTabla<FilaPlataforma>[] => [
  { id: "nombre", label: "Plataforma", ocultable: false, clase: "font-medium", render: (p) => p.nombre },
  { id: "estado", label: "En retiros", ocultable: true, render: (p) => <DisponibleToggle id={p.id} disponible={p.disponible} /> },
  {
    id: "fulfillment",
    label: "Fulfillment por pedido",
    ocultable: true,
    render: (p) => (
      <CeldaFulfillment
        key={`${p.id}-${p.fulfillment}`}
        id={p.id}
        plataforma={p.nombre}
        nombrePais={nombrePais}
        valor={p.fulfillment}
        equivalente={p.fulfillmentEquivalente}
        esDropi={p.nombre.trim().toLowerCase() === "dropi"}
        puedeEscribir={puedeEscribir}
      />
    ),
  },
];

/**
 * Plataformas del país con la barra de herramientas común (agrupar por estado, ocultas, filtros y «Agregar»): si salen al crear un retiro y su
 * fulfillment por pedido en dólares (el de Dropi es el de las publicaciones de Gestión de IDs Dropi del país).
 */
export function TablaPlataformas({
  plataformas,
  paisId,
  nombrePais,
  puedeEscribir,
}: {
  plataformas: FilaPlataforma[];
  paisId: string;
  nombrePais: string;
  puedeEscribir: boolean;
}) {
  return (
    <TablaDatos
      def={DEF_PLATAFORMAS}
      filas={plataformas}
      columnas={columnas(nombrePais, puedeEscribir)}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      accionPrincipal={puedeEscribir ? <CrearPlataformaPanel paisId={paisId} /> : undefined}
      anchoMinimo="24rem"
      ariaLabel="Plataformas del país"
      vacio="Este país no tiene plataformas registradas."
    />
  );
}
