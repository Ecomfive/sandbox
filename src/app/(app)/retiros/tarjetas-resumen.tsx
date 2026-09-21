"use client";

import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_RETIROS } from "./filtros";

/**
 * Las tarjetas «Abiertos / Con novedad / Cerrados este mes». Filtran la tabla de retiros (la de abajo) por estado:
 * «Abiertos» y «Con novedad» se pueden juntar (retiros abiertos O con novedad) y pulsar una otra vez la quita; al
 * quitar la última la tabla queda sin filtrar. «Cerrados este mes» es aparte: además del estado filtra por el mes de
 * creación que suma, así que no se combina con las otras (al pulsarla las apaga, y al pulsar una de ellas se apaga).
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
  const estado = (valor: string) => ({ campo: "estado", valor: { tipo: "seleccion" as const, valores: [valor] } });
  const cerradosMes: AtajoFiltro = {
    id: "cerrados-mes",
    etiqueta: "Cerrados este mes",
    ayuda: "Filtrar la tabla: cerrados este mes",
    filtro: estado("cerrado"),
    ademas: [{ campo: "creacion", valor: { tipo: "fecha", desde: mesDesde, hasta: mesHasta } }],
  };
  const porEstado = (id: string, etiqueta: string, valor: string): AtajoFiltro => ({
    id,
    etiqueta,
    ayuda: `Filtrar la tabla: ${etiqueta.toLowerCase()}`,
    filtro: estado(valor),
    suma: true,
    excluye: [cerradosMes],
  });
  return (
    <KpiGrid compacta>
      <KpiFiltro def={DEF_RETIROS} atajo={porEstado("abiertos", "Abiertos", "abierto")} titulo="Abiertos" valor={abiertos} compacta />
      <KpiFiltro
        def={DEF_RETIROS}
        atajo={porEstado("con-novedad", "Con novedad", "novedad")}
        titulo="Con novedad"
        valor={conNovedad}
        tono={conNovedad > 0 ? "destructive" : "neutral"}
        compacta
      />
      <KpiFiltro def={DEF_RETIROS} atajo={cerradosMes} titulo="Cerrados este mes" valor={cerradosDelMes} compacta />
    </KpiGrid>
  );
}
