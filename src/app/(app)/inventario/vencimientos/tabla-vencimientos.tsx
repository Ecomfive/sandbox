"use client";

import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_VENCIMIENTOS, ETIQUETA_ESTADO_VENCIMIENTO, type FilaVencimiento } from "./def-vencimientos";

const NOMBRE: NombreFilas = { singular: "lote", plural: "lotes" };
const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, sku: ProductoIcon, lote: InventarioIcon, vence: CalendarioIcon, cantidad: InventarioIcon };
const TONO = { vencido: "destructive", por_vencer: "warning", vigente: "neutral" } as const;

function textoDias(d: number): string {
  if (d < 0) return `hace ${-d} ${d === -1 ? "día" : "días"}`;
  if (d === 0) return "hoy";
  return `en ${d} ${d === 1 ? "día" : "días"}`;
}

const COLUMNAS: ColumnaTabla<FilaVencimiento>[] = [
  { id: "estado", label: "Estado", ocultable: false, render: (f) => <Badge tone={TONO[f.estado]}>{ETIQUETA_ESTADO_VENCIMIENTO[f.estado]}</Badge> },
  { id: "sku", label: "SKU", ocultable: false, clase: "font-medium", render: (f) => f.sku },
  { id: "producto", label: "Producto", ocultable: true, clase: "text-muted-foreground", render: (f) => f.producto },
  { id: "lote", label: "Lote", ocultable: true, render: (f) => f.lote },
  { id: "vence", label: "Vence", ocultable: true, render: (f) => `${formatearFecha(f.vence)} (${textoDias(f.dias)})` },
  { id: "cantidad", label: "Unidades", ocultable: true, clase: "tabular-nums", render: (f) => f.cantidad },
];

/** Lotes con unidades, los vencidos y por vencer arriba (el servidor ya los trae ordenados por fecha). */
export function TablaVencimientos({ filas }: { filas: FilaVencimiento[] }) {
  return (
    <TablaDatos
      def={DEF_VENCIMIENTOS}
      filas={filas}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Lotes por vencimiento"
      vacio="Ningún lote tiene unidades todavía. Activa el vencimiento en un producto y registra una entrada con su lote."
    />
  );
}
