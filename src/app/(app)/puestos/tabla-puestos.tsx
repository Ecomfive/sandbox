"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, PersonaIcon, PuestosIcon } from "@/lib/nav-icons";
import type { FilaPuesto } from "@/lib/puestos/datos";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearPuestoPanel } from "./crear-puesto-panel";
import { DEF_PUESTOS, libres } from "./def-puestos";
import { FichaPuesto, type OpcionesFicha } from "./ficha-puesto";

const NOMBRE: NombreFilas = { singular: "puesto", plural: "puestos" };
const ICONOS: Record<string, IconoComp> = { area: PuestosIcon, vacante: PersonaIcon, estado: EstadoIcon, nombre: PuestosIcon, reporta: PuestosIcon, personas: PersonaIcon };

const COLUMNAS: ColumnaTabla<FilaPuesto>[] = [
  { id: "nombre", label: "Puesto", ocultable: false, clase: "font-medium", render: (p) => p.nombre },
  { id: "reporta", label: "Reporta a", ocultable: true, clase: "text-muted-foreground", render: (p) => p.reportaANombre || "—" },
  {
    id: "personas",
    label: "Personas",
    ocultable: true,
    render: (p) => (
      <span className="flex items-center gap-2">
        {libres(p) > 0 && <span role="img" aria-label="Con vacante" className="h-2 w-2 shrink-0 rounded-full bg-warning" />}
        <span className="truncate">{p.ocupantes.length > 0 ? p.ocupantes.map((o) => o.nombre).join(", ") : "Vacante"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {p.ocupantes.length}/{p.plazas}
        </span>
      </span>
    ),
  },
  {
    id: "onboarding",
    label: "SOP y cursos",
    ocultable: true,
    clase: "text-muted-foreground",
    render: (p) => {
      const manuales = p.enlaces.filter((e) => e.tipo === "manual").length;
      const cursos = p.enlaces.length - manuales;
      return p.enlaces.length === 0 ? "—" : `${manuales} ${manuales === 1 ? "manual" : "manuales"} · ${cursos} ${cursos === 1 ? "curso" : "cursos"}`;
    },
  },
  { id: "estado", label: "Estado", ocultable: true, render: (p) => <Badge tone={p.activo ? "success" : "warning"}>{p.activo ? "Activo" : "Inactivo"}</Badge> },
];

/** Lista de puestos con la barra de herramientas común y «Agregar». Toda la fila abre la ficha del puesto. */
export function TablaPuestos({
  puestos,
  opciones,
  codigoPais,
  puedeEscribir,
  abrirInicial,
}: {
  puestos: FilaPuesto[];
  opciones: Omit<OpcionesFicha, "puestos">;
  codigoPais: string;
  puedeEscribir: boolean;
  /** `?abrir=<id>` (desde el buscador): la ficha de ese puesto arranca abierta. */
  abrirInicial: string | null;
}) {
  const [abierto, setAbierto] = useState<string | null>(abrirInicial);
  const indice = puestos.findIndex((p) => p.id === abierto);
  const ir = (i: number) => (i >= 0 && i < puestos.length ? () => setAbierto(puestos[i].id) : undefined);
  const lista = puestos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));
  return (
    <>
      <TablaDatos
        def={DEF_PUESTOS}
        filas={puestos}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        anchoMinimo="48rem"
        accionPrincipal={puedeEscribir ? <CrearPuestoPanel puestos={lista.filter((p) => p.activo)} /> : undefined}
        abrirFila={{ etiqueta: (p) => `Abrir la ficha del puesto ${p.nombre}`, alAbrir: (p) => setAbierto(p.id) }}
        ariaLabel="Puestos"
        vacio="Todavía no hay puestos."
      />
      <FichaPuesto
        puesto={puestos[indice]}
        opciones={{ ...opciones, puestos: lista }}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        anterior={ir(indice - 1)}
        siguiente={ir(indice + 1)}
        alCerrar={() => setAbierto(null)}
      />
    </>
  );
}
