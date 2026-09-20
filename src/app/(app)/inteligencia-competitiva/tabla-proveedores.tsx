"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, InteligenciaIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_PROVEEDORES, type FilaProveedor } from "./def-proveedores";

const NOMBRE: NombreFilas = { singular: "proveedor", plural: "proveedores" };
const ICONOS: Record<string, IconoComp> = {
  ciudad: TiendaIcon,
  categoria: InteligenciaIcon,
  tendencia: EstadoIcon,
  proveedor: TiendaIcon,
  productos: InteligenciaIcon,
  diferencia: InteligenciaIcon,
};

function Cambio({ cambio }: { cambio: number | null }) {
  if (cambio === null) return <span className="text-xs text-muted-foreground">Sin historial</span>;
  if (cambio === 0) return <Badge tone="neutral">Sin cambio</Badge>;
  return cambio > 0 ? <Badge tone="success">+{cambio}</Badge> : <Badge tone="destructive">{cambio}</Badge>;
}

const COLUMNAS: ColumnaTabla<FilaProveedor>[] = [
  {
    id: "proveedor",
    label: "Proveedor",
    ocultable: false,
    render: (p) => (
      <Link href={`/inteligencia-competitiva/${p.id}`} className="hover:underline">
        <p className="font-medium">{p.titulo}</p>
        {p.subtitulo && <p className="text-xs text-muted-foreground">{p.subtitulo}</p>}
      </Link>
    ),
  },
  { id: "ciudad", label: "Ciudad", ocultable: true, clase: "text-muted-foreground", render: (p) => p.ciudad ?? "—" },
  { id: "categorias", label: "Categorías", ocultable: true, clase: "text-muted-foreground", render: (p) => p.categorias.join(", ") || "—" },
  { id: "productos", label: "Productos", ocultable: true, clase: "tabular-nums", render: (p) => p.actual ?? "—" },
  { id: "cambio", label: "Cambio", ocultable: true, render: (p) => <Cambio cambio={p.cambio} /> },
];

/** Proveedores competidores con la barra de herramientas común (agrupar por ciudad o cambio, filtros y columnas). */
export function TablaProveedores({ proveedores }: { proveedores: FilaProveedor[] }) {
  return (
    <TablaDatos
      def={DEF_PROVEEDORES}
      filas={proveedores}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      claseFila={() => "hover:bg-muted/50"}
      formatearTotal={(total) => `${total.toLocaleString("es")} productos`}
      anchoMinimo="42rem"
      ariaLabel="Proveedores rastreados"
      vacio="Todavía no hay proveedores rastreados."
    />
  );
}
