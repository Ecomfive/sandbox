"use client";

import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { AlertaIcon, DropshipperIcon, EstadoIcon, PedidoIcon, PersonaIcon, PrioridadIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import {
  DEF_CASOS,
  etiquetaAntiguedad,
  etiquetaCanal,
  etiquetaEstadoCaso,
  etiquetaPrioridad,
  etiquetaTipoCaso,
  type FilaCaso,
} from "./def-crm";

const NOMBRE: NombreFilas = { singular: "caso", plural: "casos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  prioridad: PrioridadIcon,
  tipo: AlertaIcon,
  canal: PersonaIcon,
  responsable: PersonaIcon,
  dropshipper: DropshipperIcon,
  titulo: AlertaIcon,
  pedido: PedidoIcon,
  antiguedad: EstadoIcon,
};

const TONO_PRIORIDAD: Record<string, "destructive" | "warning" | "neutral"> = { alta: "destructive", normal: "warning", baja: "neutral" };
const TONO_ESTADO: Record<string, "warning" | "info" | "success"> = { abierto: "warning", en_curso: "info", resuelto: "success" };

const COLUMNAS: ColumnaTabla<FilaCaso>[] = [
  {
    id: "titulo",
    label: "Caso",
    ocultable: false,
    render: (c) => (
      <span className="flex flex-col">
        <span className="font-medium">{c.titulo}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{c.codigo}</span>
      </span>
    ),
  },
  { id: "dropshipper", label: "Dropshipper", ocultable: true, render: (c) => c.dropshipper },
  { id: "tipo", label: "Tipo", ocultable: true, render: (c) => etiquetaTipoCaso(c.tipo) },
  { id: "prioridad", label: "Prioridad", ocultable: true, render: (c) => <Badge tone={TONO_PRIORIDAD[c.prioridad] ?? "neutral"}>{etiquetaPrioridad(c.prioridad)}</Badge> },
  { id: "estado", label: "Estado", ocultable: true, render: (c) => <Badge tone={TONO_ESTADO[c.estado] ?? "neutral"}>{etiquetaEstadoCaso(c.estado)}</Badge> },
  { id: "pedido", label: "Pedido", ocultable: true, clase: "tabular-nums", render: (c) => c.numeroPedido ?? "—" },
  { id: "responsable", label: "Responsable", ocultable: true, render: (c) => c.responsable ?? <span className="text-muted-foreground">Sin asignar</span> },
  { id: "canal", label: "Canal", ocultable: true, render: (c) => etiquetaCanal(c.canal) },
  { id: "antiguedad", label: "Abierto hace", ocultable: true, clase: "text-right tabular-nums", render: (c) => etiquetaAntiguedad(c.horasAbierto) },
];

/** Casos de soporte con la barra común (agrupar por estado, resueltos, filtros y columnas). */
export function TablaCasos({ casos }: { casos: FilaCaso[] }) {
  return (
    <TablaDatos
      def={DEF_CASOS}
      filas={casos}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(c) => c.id}
      anchoMinimo="60rem"
      ariaLabel="Casos de soporte"
      vacio="Todavía no hay casos de soporte."
    />
  );
}
