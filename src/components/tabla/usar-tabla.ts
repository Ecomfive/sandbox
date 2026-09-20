"use client";

import { useMemo, useState } from "react";
import { filtroActivo, type DefTabla } from "@/lib/tabla/motor";
import { agruparFilas, aplicarVista } from "@/lib/tabla/vista";
import { useFiltros, useVista } from "./ganchos";

/**
 * Todo lo que necesita una tabla con la barra de herramientas: los filtros y la vista guardados, las filas
 * que quedan tras aplicarlos, los grupos y cuáles están contraídos. Cada módulo solo dibuja las filas.
 */
export function useTablaInteractiva<F>(def: DefTabla<F>, filas: F[], opciones: { limiteSinFiltros?: number } = {}) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  const [vista, cambiarVista] = useVista(def);
  const hayFiltros = filtros.some(filtroActivo);
  const agrupado = vista.agrupar !== null;

  const resultado = useMemo(
    () => aplicarVista(def, filas, filtros, vista.mostrarCerrados),
    [def, filas, filtros, vista.mostrarCerrados]
  );
  const { limiteSinFiltros } = opciones;
  const visibles = useMemo(
    () =>
      hayFiltros || agrupado || limiteSinFiltros === undefined
        ? resultado.filas
        : resultado.filas.slice(0, limiteSinFiltros),
    [resultado.filas, hayFiltros, agrupado, limiteSinFiltros]
  );
  const grupos = useMemo(
    () => (vista.agrupar ? agruparFilas(def, visibles, vista.agrupar, vista.orden) : []),
    [def, visibles, vista.agrupar, vista.orden]
  );

  // Grupos contraídos: se olvidan al cambiar el campo de agrupación, porque las claves ya no aplican.
  const [contraidosPor, setContraidosPor] = useState<{ campo: string | null; claves: string[] }>({
    campo: null,
    claves: [],
  });
  const contraidos = new Set(contraidosPor.campo === vista.agrupar ? contraidosPor.claves : []);

  function alternarGrupo(clave: string) {
    if (!vista.agrupar) return;
    const claves = contraidos.has(clave) ? [...contraidos].filter((c) => c !== clave) : [...contraidos, clave];
    setContraidosPor({ campo: vista.agrupar, claves });
  }
  const contraerTodos = () => setContraidosPor({ campo: vista.agrupar, claves: grupos.map((g) => g.clave) });
  const expandirTodos = () => setContraidosPor({ campo: vista.agrupar, claves: [] });

  return {
    filtros,
    cambiarFiltros,
    vista,
    cambiarVista,
    hayFiltros,
    agrupado,
    resultado,
    visibles,
    grupos,
    contraidos,
    alternarGrupo,
    contraerTodos,
    expandirTodos,
  };
}

export type TablaInteractiva<F> = ReturnType<typeof useTablaInteractiva<F>>;
