"use client";

import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_RETIROS } from "./filtros";

const porEstado = (id: string, etiqueta: string, estado: string, ademas?: AtajoFiltro["ademas"]): AtajoFiltro => ({
  id,
  etiqueta,
  ayuda: `Filtrar la tabla: ${etiqueta.toLowerCase()}`,
  filtro: { campo: "estado", valor: { tipo: "seleccion", valores: [estado] } },
  ademas,
});

/**
 * Las tarjetas «Abiertos / Con novedad / Cerrados este mes»: al pulsar una filtran la tabla de retiros (la de
 * abajo) por ese estado, y la de cerrados también por el mes de creación que suma. Pulsarla otra vez quita el filtro.
 */
export function TarjetasResumenRetiros({
  abiertos,
  conNovedad,
  cerradosDelMes,
  mesDesde,
  mesHasta,
}: {
  abiertos: number;
  conNovedad: number;
  /** Ya formateado: lo que suman los cerrados del mes. */
  cerradosDelMes: string;
  /** Primer y último día del mes (AAAA-MM-DD): el rango de «Creación» que suma la tarjeta de cerrados. */
  mesDesde: string;
  mesHasta: string;
}) {
  return (
    <KpiGrid>
      <KpiFiltro def={DEF_RETIROS} atajo={porEstado("abiertos", "Abiertos", "abierto")} titulo="Abiertos" valor={abiertos} />
      <KpiFiltro
        def={DEF_RETIROS}
        atajo={porEstado("con-novedad", "Con novedad", "novedad")}
        titulo="Con novedad"
        valor={conNovedad}
        tono={conNovedad > 0 ? "destructive" : "neutral"}
      />
      <KpiFiltro
        def={DEF_RETIROS}
        atajo={porEstado("cerrados-mes", "Cerrados este mes", "cerrado", [
          { campo: "creacion", valor: { tipo: "fecha", desde: mesDesde, hasta: mesHasta } },
        ])}
        titulo="Cerrados este mes"
        valor={cerradosDelMes}
      />
    </KpiGrid>
  );
}
