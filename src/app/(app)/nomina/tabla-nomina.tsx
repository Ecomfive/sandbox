"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CheckIcon, EstadoIcon, GastoIcon, PersonaIcon, PuestosIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_NOMINA, ETIQUETA_TIPO, type FilaNomina } from "./def-nomina";
import { FichaPersona } from "./ficha-persona";
import { dinero2 } from "@/lib/af4/formato";

const NOMBRE: NombreFilas = { singular: "pago", plural: "pagos" };
const ICONOS: Record<string, IconoComp> = {
  tienda: TiendaIcon,
  tipo: PuestosIcon,
  cargo: PuestosIcon,
  tramo: CalendarioIcon,
  pagado: CheckIcon,
  cuadra: EstadoIcon,
  nombre: PersonaIcon,
  bruto: GastoIcon,
  neto: GastoIcon,
  fecha: CalendarioIcon,
};

const suma = (filas: FilaNomina[], f: (x: FilaNomina) => number) => dinero2(filas.reduce((a, x) => a + f(x), 0));

const COLUMNAS: ColumnaTabla<FilaNomina, null>[] = [
  {
    id: "nombre",
    label: "Persona",
    ocultable: false,
    render: (f) => (
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {f.diferencia !== 0 && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
          {f.nombre}
          {f.diferencia !== 0 && <span className="sr-only"> (no cuadra con la fórmula)</span>}
        </span>
        {f.documento && <span className="text-xs text-muted-foreground tabular-nums">{f.documento}</span>}
      </span>
    ),
  },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => ETIQUETA_TIPO[f.tipo] },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.unidad },
  { id: "cargo", label: "Cargo o rol", ocultable: true, clase: "max-w-56 truncate", render: (f) => f.cargo },
  { id: "tramo", label: "Pago", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => f.tramo || "—" },
  {
    id: "bruto",
    label: "Costo",
    descripcion: "Total asignaciones de la planilla o total USDT de la externa",
    ocultable: false,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (f) => dinero2(f.bruto, f.moneda),
    total: (filas) => suma(filas, (x) => x.bruto),
  },
  {
    id: "retenciones",
    label: "Seguros",
    descripcion: "Seguro Social (9,75 %) y Seguro Educativo (1,25 %) retenidos",
    ocultable: true,
    clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground",
    render: (f) => (f.seguroSocial + f.seguroEducativo ? dinero2(f.seguroSocial + f.seguroEducativo) : "—"),
    total: (filas) => suma(filas, (x) => x.seguroSocial + x.seguroEducativo),
  },
  {
    id: "neto",
    label: "Neto pagado",
    ocultable: true,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (f) => dinero2(f.neto, f.moneda),
    total: (filas) => suma(filas, (x) => x.neto),
  },
  {
    id: "pagado",
    label: "Pagado",
    ocultable: true,
    clase: "whitespace-nowrap text-muted-foreground",
    render: (f) => (f.pagado === true ? "Sí" : f.pagado === false ? "No" : "—"),
  },
];

/** Las líneas del mes; toda la fila abre la ficha de la persona con su historial de pagos. */
export function TablaNomina({
  filas,
  tiendas,
  puedeEscribir,
}: {
  filas: FilaNomina[];
  tiendas: { id: string; nombre: string }[];
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<{ personaId: string; orden: string[] } | null>(null);
  // Para pasar de una persona a otra con las flechas, en el orden en que se ven (sin repetir).
  const personas = abierta ? [...new Set(abierta.orden.map((id) => filas.find((f) => f.id === id)?.personaId).filter(Boolean))] as string[] : [];
  const i = abierta ? personas.indexOf(abierta.personaId) : -1;
  const ir = (k: number) => (personas[k] ? () => setAbierta((a) => (a ? { ...a, personaId: personas[k] } : a)) : undefined);
  return (
    <>
      <TablaDatos
        def={DEF_NOMINA}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={(v) => dinero2(v)}
        abrirFila={{ etiqueta: (f) => `Abrir la ficha de ${f.nombre}`, alAbrir: (f, orden) => setAbierta({ personaId: f.personaId, orden }) }}
        ariaLabel="Pagos de nómina del mes"
        vacio="No hay pagos de nómina en este mes."
      />
      {abierta && (
        <FichaPersona
          key={abierta.personaId}
          personaId={abierta.personaId}
          tiendas={tiendas}
          puedeEscribir={puedeEscribir}
          anterior={ir(i - 1)}
          siguiente={ir(i + 1)}
          alCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}
