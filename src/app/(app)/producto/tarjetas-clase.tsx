"use client";

import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_PRODUCTO, ETIQUETA_CLASE } from "./def-producto";

const atajoDeClase = (clase: string): AtajoFiltro => ({
  id: `clase-${clase}`,
  etiqueta: ETIQUETA_CLASE[clase] ?? clase,
  ayuda: `Filtrar la tabla: ${(ETIQUETA_CLASE[clase] ?? clase).toLowerCase()}`,
  filtro: { campo: "clase", valor: { tipo: "seleccion", valores: [clase] } },
  suma: true,
});

/** Las tarjetas «Físicos / Test»: al pulsar una filtran la lista por esa clase (se pulsa otra vez para quitarla). */
export function TarjetasClase({ conteo }: { conteo: { fisico: number; test: number } }) {
  return (
    <KpiGrid>
      <KpiFiltro def={DEF_PRODUCTO} atajo={atajoDeClase("fisico")} titulo="Físicos" valor={conteo.fisico} />
      <KpiFiltro def={DEF_PRODUCTO} atajo={atajoDeClase("test")} titulo="Test" valor={conteo.test} />
    </KpiGrid>
  );
}
