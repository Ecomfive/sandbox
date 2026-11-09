"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, EstadoIcon, HistorialIcon, PersonaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

export interface FilaEjecucion {
  id: string;
  tarea: string;
  titulo: string;
  /** Ya formateado en hora de Panamá. */
  cuando: string;
  inicio: string;
  duracion: string;
  estado: "ok" | "error" | "corriendo" | "pendiente";
  disparo: string;
  texto: string;
}

const ETIQUETA_ESTADO: Record<FilaEjecucion["estado"], string> = { ok: "Terminó", error: "Falló", corriendo: "Sin terminar", pendiente: "Siguió después" };

const DEF: DefTabla<FilaEjecucion> = {
  clave: "panel-financiero-tareas-ejecuciones",
  campos: [
    { id: "titulo", etiqueta: "Tarea", tipo: "seleccion", valores: (f) => [f.titulo], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO[f.estado]], agrupable: true },
    { id: "disparo", etiqueta: "Disparo", tipo: "seleccion", valores: (f) => [f.disparo], agrupable: true },
    { id: "inicio", etiqueta: "Inicio", tipo: "fecha", valor: (f) => f.inicio },
  ],
};
const NOMBRE: NombreFilas = { singular: "ejecución", plural: "ejecuciones" };
const ICONOS: Record<string, IconoComp> = { titulo: HistorialIcon, estado: EstadoIcon, disparo: PersonaIcon, inicio: CalendarioIcon };
const TONO: Record<FilaEjecucion["estado"], string> = { ok: "bg-success", error: "bg-destructive", corriendo: "bg-warning", pendiente: "bg-warning" };

const COLUMNAS: ColumnaTabla<FilaEjecucion, null>[] = [
  { id: "cuando", label: "Inicio", ocultable: false, clase: "whitespace-nowrap tabular-nums", render: (f) => f.cuando },
  { id: "titulo", label: "Tarea", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.titulo },
  {
    id: "estado",
    label: "Estado",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONO[f.estado]}`} />
        {ETIQUETA_ESTADO[f.estado]}
      </span>
    ),
  },
  { id: "duracion", label: "Duración", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap", render: (f) => f.duracion },
  { id: "disparo", label: "Disparo", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (f) => f.disparo },
  { id: "texto", label: "Resultado", ocultable: false, clase: "min-w-72 max-w-2xl", render: (f) => <span className="line-clamp-3">{f.texto}</span> },
];

export function TablaEjecuciones({ filas }: { filas: FilaEjecucion[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Últimas ejecuciones"
      vacio="Todavía no corrió ninguna tarea."
    />
  );
}
