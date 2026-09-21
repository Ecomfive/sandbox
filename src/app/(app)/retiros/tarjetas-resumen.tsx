"use client";

import { KpiCard } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_RETIROS } from "./filtros";

const retiros = (n: number) => `${n} ${n === 1 ? "retiro" : "retiros"}`;

/**
 * Las tarjetas de retiros de la barra «Dashboard» (junto al saldo de wallet): Abiertos, Con novedad, Cerrados este
 * mes (monto y cuántos son), Cerrados (cuántos en total) y Total de retiros. Se dibujan como tarjetas hermanas, sin
 * contenedor propio, para que la barra las trate igual que al saldo. Las de estado filtran la tabla de retiros (la de
 * abajo): «Abiertos», «Con novedad» y «Cerrados» se pueden juntar (retiros de un estado O de otro) y pulsar una otra
 * vez la quita; al quitar la última la tabla queda sin filtrar. «Cerrados este mes» es aparte: además del estado
 * filtra por el mes de creación que suma, así que no se combina con las otras (al pulsarla las apaga, y al pulsar una
 * de ellas se apaga). «Total de retiros» solo cuenta: no filtra nada.
 */
export function TarjetasResumenRetiros({
  abiertos,
  conNovedad,
  cerradosDelMes,
  cantidadCerradosDelMes,
  cerrados,
  totalRetiros,
  mesDesde,
  mesHasta,
}: {
  abiertos: number;
  conNovedad: number;
  /** Ya formateado: lo que suman los cerrados del mes. */
  cerradosDelMes: string;
  /** Cuántos retiros son esos cerrados del mes. */
  cantidadCerradosDelMes: number;
  /** Cuántos retiros cerrados hay en total (de cualquier mes). */
  cerrados: number;
  /** Cuántos retiros hay, en cualquier estado. */
  totalRetiros: number;
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
    <>
      <KpiFiltro def={DEF_RETIROS} atajo={porEstado("abiertos", "Abiertos", "abierto")} titulo="Retiros abiertos" valor={abiertos} compacta />
      <KpiFiltro
        def={DEF_RETIROS}
        atajo={porEstado("con-novedad", "Con novedad", "novedad")}
        titulo="Retiros con novedad"
        valor={conNovedad}
        tono={conNovedad > 0 ? "destructive" : "neutral"}
        compacta
      />
      <KpiFiltro
        def={DEF_RETIROS}
        atajo={cerradosMes}
        titulo="Cerrados este mes"
        valor={cerradosDelMes}
        subtexto={retiros(cantidadCerradosDelMes)}
        compacta
      />
      <KpiFiltro def={DEF_RETIROS} atajo={porEstado("cerrados", "Cerrados", "cerrado")} titulo="Retiros cerrados" valor={cerrados} compacta />
      <KpiCard titulo="Total de retiros" valor={totalRetiros} compacta />
    </>
  );
}
