"use client";

import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_MOVIMIENTOS, type FilaMovimiento } from "./def-movimientos";

const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = {
  tipo: EstadoIcon,
  fuente: InventarioIcon,
  sku: ProductoIcon,
  producto: ProductoIcon,
  fecha: CalendarioIcon,
  cantidad: InventarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaMovimiento>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, render: (m) => formatearFecha(m.fecha) },
  { id: "sku", label: "SKU", ocultable: true, clase: "font-medium", render: (m) => m.sku },
  { id: "producto", label: "Producto", ocultable: true, clase: "text-muted-foreground", render: (m) => m.producto },
  { id: "tipo", label: "Tipo", ocultable: true, render: (m) => <Badge tone={m.tipo === "entrada" ? "success" : "neutral"}>{m.tipo}</Badge> },
  { id: "cantidad", label: "Cantidad", ocultable: true, clase: "tabular-nums", render: (m) => m.cantidad },
  { id: "fuente", label: "Fuente", ocultable: true, clase: "text-muted-foreground", render: (m) => m.fuente },
];

/** Movimientos recientes de inventario con la barra de herramientas común (agrupar por tipo o fuente, filtros y columnas). */
export function TablaMovimientos({ movimientos }: { movimientos: FilaMovimiento[] }) {
  return (
    <TablaDatos
      def={DEF_MOVIMIENTOS}
      filas={movimientos}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(m) => m.id}
      ariaLabel="Movimientos recientes de inventario"
      vacio="Todavía no hay movimientos de inventario."
    />
  );
}
