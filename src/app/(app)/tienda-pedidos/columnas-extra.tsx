"use client";

import type { ColumnaTabla } from "@/components/tabla/tabla-datos";
import type { PedidoFila } from "@/lib/tienda/datos";
import { cuandoProgramado, diasHasta } from "@/lib/tienda/programado";
import type { Contexto } from "./pedidos-tienda";

const diaCorto = (fecha: string) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * «Programado» (12 nov 2026): el día que pidió el cliente, leído de la nota del pedido en Shopify; en rojo si ya pasó y el pedido no ha salido.
 * Al pasar el cursor se ve el pedazo de la nota. Lo usan Confirmación y Logística.
 */
export function columnaProgramado(hoy: string): ColumnaTabla<PedidoFila, Contexto> {
  return {
    id: "programado",
    label: "Programado",
    descripcion: "El día que pidió el cliente, leído de la nota del pedido en Shopify. Al pasar el cursor se ve la nota.",
    ocultable: true,
    clase: "whitespace-nowrap",
    render: (p) => {
      if (!p.programado) return <span className="text-muted-foreground">—</span>;
      const d = diasHasta(p.programado.fecha, hoy);
      return (
        <span title={`«${p.programado.cita}»`} className={d < 0 && (p.estado === "nuevo" || p.estado === "confirmado") ? "text-destructive" : undefined}>
          {p.programado.tipo === "desde" ? "desde " : ""}
          {diaCorto(p.programado.fecha)} <span className="text-muted-foreground">· {cuandoProgramado(p.programado.fecha, hoy)}</span>
        </span>
      );
    },
  };
}
