"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, DropshipperIcon, EstadoIcon, EtiquetaIcon, PersonaIcon, PedidoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearDropshipperPanel } from "./crear-dropshipper-panel";
import { DEF_DROPSHIPPERS, etiquetaEstado, etiquetaNivel, etiquetaUltimoPedido, montoCorto, type FilaCaso, type FilaDropshipper } from "./def-crm";
import { FichaDropshipper, toneEstado } from "./ficha-dropshipper";

const NOMBRE: NombreFilas = { singular: "dropshipper", plural: "dropshippers" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  nivel: EtiquetaIcon,
  responsable: PersonaIcon,
  ciudad: PersonaIcon,
  nombre: DropshipperIcon,
  contacto: PersonaIcon,
  pedidos: PedidoIcon,
  ventas: PedidoIcon,
  ultimoPedido: CalendarioIcon,
  ingreso: CalendarioIcon,
  etiqueta: EtiquetaIcon,
  notas: PersonaIcon,
};

interface Contexto {
  codigoPais: string;
  hoy: string;
}

const COLUMNAS: ColumnaTabla<FilaDropshipper, Contexto>[] = [
  {
    id: "nombre",
    label: "Dropshipper",
    ocultable: false,
    render: (d) => (
      <span className="flex flex-col">
        <span className="font-medium">{d.nombre}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {d.codigo}
          {d.tienda ? ` · ${d.tienda}` : ""}
        </span>
      </span>
    ),
  },
  { id: "estado", label: "Estado", ocultable: true, render: (d) => <Badge tone={toneEstado[d.estado] ?? "neutral"}>{etiquetaEstado(d.estado)}</Badge> },
  { id: "nivel", label: "Nivel", ocultable: true, render: (d) => <Badge tone={d.nivel === "vip" ? "warning" : "neutral"}>{etiquetaNivel(d.nivel)}</Badge> },
  { id: "ciudad", label: "Ciudad", ocultable: true, render: (d) => d.ciudad ?? "—" },
  { id: "responsable", label: "Responsable", ocultable: true, render: (d) => d.responsable ?? <span className="text-muted-foreground">Sin asignar</span> },
  { id: "pedidos", label: "Pedidos del mes", ocultable: true, clase: "text-right tabular-nums", render: (d) => (d.pedidosMes ? d.pedidosMes : "—") },
  { id: "ventas", label: "Ventas del mes", ocultable: true, clase: "text-right tabular-nums", render: (d, c) => (d.ventasMes ? montoCorto(d.ventasMes, c.codigoPais) : "—") },
  { id: "ultimoPedido", label: "Último pedido", ocultable: true, render: (d, c) => etiquetaUltimoPedido(d.ultimoPedido, c.hoy) },
  {
    id: "casos",
    label: "Casos",
    ocultable: true,
    render: (d) =>
      d.casosAbiertos ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          {d.casosAbiertos}
          <span className="sr-only"> casos abiertos</span>
        </span>
      ) : (
        "—"
      ),
  },
  {
    id: "etiquetas",
    label: "Etiquetas",
    ocultable: true,
    render: (d) =>
      d.etiquetas.length ? (
        <span className="flex gap-1">
          {d.etiquetas.map((e) => (
            <Badge key={e}>{e}</Badge>
          ))}
        </span>
      ) : (
        "—"
      ),
  },
  { id: "ingreso", label: "Ingreso", ocultable: true, render: (d) => (d.ingreso ? formatearFecha(d.ingreso) : "—") },
];

/** Directorio de dropshippers con la barra común (agrupar, inactivos, filtros, columnas y «Agregar»); la fila abre la ficha. */
export function TablaDirectorio({
  dropshippers,
  casos,
  paisId,
  codigoPais,
  hoy,
  demo,
  puedeEscribir,
}: {
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  paisId: string;
  codigoPais: string;
  hoy: string;
  demo: boolean;
  puedeEscribir: boolean;
}) {
  const [abierto, setAbierto] = useState<{ id: string; orden: string[] } | null>(null);

  return (
    <>
      <TablaDatos
        def={DEF_DROPSHIPPERS}
        filas={dropshippers}
        columnas={COLUMNAS}
        contexto={{ codigoPais, hoy }}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(d) => d.id}
        abrirFila={{ etiqueta: (d) => `Abrir la ficha de ${d.nombre}`, alAbrir: (d, orden) => setAbierto({ id: d.id, orden }) }}
        accionPrincipal={puedeEscribir ? <CrearDropshipperPanel paisId={paisId} /> : undefined}
        anchoMinimo="64rem"
        ariaLabel="Directorio de dropshippers"
        vacio="Todavía no hay dropshippers. Usa «Agregar» para registrar el primero."
      />
      <FichaDropshipper
        dropshipper={dropshippers.find((d) => d.id === abierto?.id) ?? null}
        casos={casos}
        orden={abierto?.orden ?? []}
        alIr={(id) => setAbierto((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierto(null)}
        codigoPais={codigoPais}
        hoy={hoy}
        demo={demo}
      />
    </>
  );
}
