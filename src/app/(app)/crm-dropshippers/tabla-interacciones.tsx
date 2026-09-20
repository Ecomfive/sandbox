"use client";

import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, DropshipperIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_INTERACCIONES, etiquetaTipo, type FilaInteraccion } from "./def-crm";

const NOMBRE: NombreFilas = { singular: "interacción", plural: "interacciones" };
const ICONOS: Record<string, IconoComp> = {
  dropshipper: DropshipperIcon,
  tipo: PersonaIcon,
  fecha: CalendarioIcon,
  nota: PersonaIcon,
};

const COLUMNAS: ColumnaTabla<FilaInteraccion>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, render: (i) => formatearFecha(i.fecha) },
  { id: "dropshipper", label: "Dropshipper", ocultable: true, clase: "font-medium", render: (i) => i.dropshipper },
  { id: "tipo", label: "Tipo", ocultable: true, render: (i) => <Badge tone="neutral">{etiquetaTipo(i.tipo)}</Badge> },
  { id: "nota", label: "Nota", ocultable: true, clase: "text-muted-foreground", render: (i) => i.nota },
];

/** Bitácora de interacciones recientes con la barra de herramientas común (agrupar, filtros y columnas). */
export function TablaInteracciones({ interacciones }: { interacciones: FilaInteraccion[] }) {
  return (
    <TablaDatos
      def={DEF_INTERACCIONES}
      filas={interacciones}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(i) => i.id}
      ariaLabel="Interacciones recientes"
      vacio="Todavía no hay interacciones registradas."
    />
  );
}
