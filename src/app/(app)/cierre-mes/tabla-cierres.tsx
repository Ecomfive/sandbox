"use client";

import { useRouter } from "next/navigation";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, CheckIcon, EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import { fechaCorta, hoyPanama } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { ETIQUETA_ESTADO_CIERRE, type ColorTarea, type EstadoCierre } from "@/lib/finanzas/cierre";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { InsigniaCierre, PuntoTarea } from "./estado";

export interface FilaCierreMes {
  periodo: string;
  mes: string;
  estado: EstadoCierre;
  listas: number;
  total: number;
  /** Lo que todavía no deja cerrar. */
  porResolver: number;
  color: ColorTarea;
  cerradoEn: string | null;
  cerradoPor: string | null;
  /** Fecha objetivo del cierre y su plazo («Atrasado 3 días hábiles»); `atrasado` = pasó sin cerrar. */
  objetivo: string;
  plazo: string;
  atrasado: boolean;
}

const DEF: DefTabla<FilaCierreMes> = {
  clave: "cierre-mes",
  campos: [
    { id: "mes", etiqueta: "Mes", tipo: "texto", valor: (r) => r.mes },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [ETIQUETA_ESTADO_CIERRE[r.estado]], agrupable: true },
    { id: "porResolver", etiqueta: "Por resolver", tipo: "numero", valor: (r) => r.porResolver },
    { id: "plazo", etiqueta: "Plazo", tipo: "seleccion", valores: (r) => [r.atrasado ? "Atrasado" : r.estado === "cerrado" ? "Cerrado" : "En plazo"], agrupable: true },
    { id: "cerradoPor", etiqueta: "Cerrado por", tipo: "seleccion", valores: (r) => (r.cerradoPor ? [r.cerradoPor] : []), agrupable: true },
  ],
};
const NOMBRE: NombreFilas = { singular: "mes", plural: "meses" };
const ICONOS: Record<string, IconoComp> = { mes: CalendarioIcon, estado: EstadoIcon, porResolver: CheckIcon, cerradoPor: PersonaIcon, plazo: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaCierreMes, null>[] = [
  { id: "mes", label: "Mes", ocultable: false, render: (r) => <span className="inline-block first-letter:uppercase">{r.mes}</span> },
  { id: "estado", label: "Estado", ocultable: true, render: (r) => <InsigniaCierre estado={r.estado} /> },
  {
    id: "checklist",
    label: "Checklist",
    ocultable: true,
    clase: "tabular-nums",
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <PuntoTarea color={r.color} />
        {r.listas} de {r.total}
      </span>
    ),
  },
  { id: "porResolver", label: "Por resolver", ocultable: true, clase: "text-right tabular-nums", render: (r) => (r.porResolver ? entero(r.porResolver) : "—") },
  { id: "objetivo", label: "Fecha objetivo", ocultable: true, clase: "tabular-nums", render: (r) => fechaCorta(r.objetivo) },
  {
    id: "plazo",
    label: "Plazo",
    ocultable: true,
    render: (r) =>
      r.estado === "cerrado" ? (
        "—"
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {r.atrasado && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
          {r.plazo}
        </span>
      ),
  },
  {
    id: "cerradoEn",
    label: "Cerrado",
    ocultable: true,
    clase: "tabular-nums",
    render: (r) => (r.cerradoEn ? fechaCorta(hoyPanama(new Date(r.cerradoEn))) : "—"),
  },
  { id: "cerradoPor", label: "Cerrado por", ocultable: true, render: (r) => r.cerradoPor ?? "—" },
];

export function TablaCierres({ filas }: { filas: FilaCierreMes[] }) {
  const router = useRouter();
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.periodo}
      abrirFila={{ etiqueta: (r) => `Abrir el cierre de ${r.mes}`, alAbrir: (r) => router.push(`/cierre-mes/${r.periodo.slice(0, 7)}`) }}
      ariaLabel="Cierres de mes"
      vacio="Todavía no hay meses en el libro."
    />
  );
}
