"use client";

import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_GASTOS } from "./def-gastos";

/**
 * Las tarjetas de «Este mes»: el total y una por categoría. Al pulsar una filtran la tabla de gastos de abajo por
 * ese mes (y por esa categoría); la del total, solo por el mes. Las categorías se pueden juntar (nómina O alquiler)
 * y pulsar una otra vez la quita; al quitar la última se va también el mes y la tabla queda sin filtrar.
 */
export function TarjetasGastosMes({
  total,
  categorias,
  mesDesde,
  mesHasta,
}: {
  /** Ya formateado. */
  total: string;
  categorias: { valor: string; etiqueta: string; monto: string }[];
  /** Primer y último día del mes (AAAA-MM-DD): lo que suman las tarjetas. */
  mesDesde: string;
  mesHasta: string;
}) {
  const delMes = { campo: "fecha", valor: { tipo: "fecha" as const, desde: mesDesde, hasta: mesHasta } };
  const atajoTotal: AtajoFiltro = {
    id: "total-mes",
    etiqueta: "Este mes",
    ayuda: "Filtrar la tabla: gastos de este mes",
    filtro: delMes,
  };
  return (
    <KpiGrid>
      <KpiFiltro def={DEF_GASTOS} atajo={atajoTotal} titulo="Total del mes" valor={total} />
      {categorias.map((c) => (
        <KpiFiltro
          key={c.valor}
          def={DEF_GASTOS}
          atajo={{
            id: `categoria-${c.valor}`,
            etiqueta: c.etiqueta,
            ayuda: `Filtrar la tabla: ${c.etiqueta.toLowerCase()} de este mes`,
            filtro: { campo: "categoria", valor: { tipo: "seleccion", valores: [c.valor] } },
            ademas: [delMes],
            suma: true,
          }}
          titulo={c.etiqueta}
          valor={c.monto}
        />
      ))}
    </KpiGrid>
  );
}
