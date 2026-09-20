"use client";

import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, ExtractoIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { AsignarPlataformaSelect } from "./asignar-plataforma";
import { defMovimientosBanco, type FilaMovimientoBanco } from "./def-movimientos";

const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = {
  extracto: ExtractoIcon,
  plataforma: TiendaIcon,
  tipo: EstadoIcon,
  fecha: CalendarioIcon,
  monto: GastoIcon,
  descripcion: ExtractoIcon,
};

interface Contexto {
  codigoPais: string;
  plataformas: { id: string; nombre: string }[];
}

const COLUMNAS: ColumnaTabla<FilaMovimientoBanco, Contexto>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, render: (m) => formatearFecha(m.fecha) },
  { id: "monto", label: "Monto", ocultable: true, clase: "tabular-nums", render: (m, c) => formatearMoneda(m.monto, c.codigoPais) },
  { id: "tipo", label: "Tipo", ocultable: true, render: (m) => <Badge tone={m.tipo === "deposito" ? "success" : "neutral"}>{m.tipo}</Badge> },
  { id: "descripcion", label: "Descripción", ocultable: true, clase: "text-muted-foreground", render: (m) => m.descripcion },
  {
    id: "plataforma",
    label: "Plataforma",
    ocultable: true,
    render: (m, c) => (
      <AsignarPlataformaSelect movimientoId={m.id} plataformaIdActual={m.plataformaId} plataformas={c.plataformas} />
    ),
  },
];

/**
 * Movimientos de los últimos extractos con la barra de herramientas común. Arranca agrupada por extracto
 * cargado; se puede cambiar a plataforma o tipo, o quitar la agrupación.
 */
export function TablaMovimientosBanco({
  movimientos,
  codigoPais,
  plataformas,
}: {
  movimientos: FilaMovimientoBanco[];
  codigoPais: string;
  plataformas: { id: string; nombre: string }[];
}) {
  return (
    <TablaDatos
      def={defMovimientosBanco(codigoPais)}
      filas={movimientos}
      columnas={COLUMNAS}
      contexto={{ codigoPais, plataformas }}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(m) => m.id}
      ariaLabel="Movimientos de los últimos extractos"
      vacio="Todavía no hay extractos cargados."
    />
  );
}
