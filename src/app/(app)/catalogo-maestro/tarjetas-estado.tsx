"use client";

import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_CATALOGO, ETIQUETA_ESTADO } from "./def-catalogo";

const atajoDeEstado = (estado: string): AtajoFiltro => ({
  id: `estado-${estado}`,
  etiqueta: ETIQUETA_ESTADO[estado] ?? estado,
  ayuda: `Filtrar la tabla: ${(ETIQUETA_ESTADO[estado] ?? estado).toLowerCase()}`,
  filtro: { campo: "estado", valor: { tipo: "seleccion", valores: [estado] } },
  suma: true,
});

/**
 * Las tarjetas «Propuestos / En revisión / Aprobados» del catálogo: al pulsar una filtran la tabla de SKU por ese estado.
 * Se pueden juntar (propuestos O en revisión) y pulsar una otra vez la quita; sin ninguna la tabla queda sin filtrar.
 */
export function TarjetasEstadoCatalogo({ conteo }: { conteo: { propuesto: number; en_revision: number; aprobado: number } }) {
  return (
    <KpiGrid>
      <KpiFiltro def={DEF_CATALOGO} atajo={atajoDeEstado("propuesto")} titulo="Propuestos" valor={conteo.propuesto} />
      <KpiFiltro def={DEF_CATALOGO} atajo={atajoDeEstado("en_revision")} titulo="En revisión" valor={conteo.en_revision} />
      <KpiFiltro def={DEF_CATALOGO} atajo={atajoDeEstado("aprobado")} titulo="Aprobados" valor={conteo.aprobado} />
    </KpiGrid>
  );
}
