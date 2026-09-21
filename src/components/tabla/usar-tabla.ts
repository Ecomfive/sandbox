"use client";

import { useMemo, useState } from "react";
import { filtroActivo, type DefTabla } from "@/lib/tabla/motor";
import { calcularPagina } from "@/lib/tabla/paginacion";
import { agruparFilas, aplicarVista } from "@/lib/tabla/vista";
import { useFiltros, useVista } from "./ganchos";

/**
 * Todo lo que necesita una tabla con la barra de herramientas: los filtros y la vista guardados, las filas
 * que quedan tras aplicarlos, los grupos y cuáles están contraídos. Cada módulo solo dibuja las filas.
 */
export function useTablaInteractiva<F>(
  def: DefTabla<F>,
  filas: F[],
  opciones: {
    /** Tope de filas sin filtros ni grupos (sin paginación: el resto se ve con filtros). */
    limiteSinFiltros?: number;
    /** Filas por página cuando no hay filtros ni grupos: `visibles` es la página actual y `paginacion` dice cuál es. Con filtros o grupos se ven todas. */
    porPagina?: number;
  } = {}
) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  const [vista, cambiarVista] = useVista(def);
  const hayFiltros = filtros.some(filtroActivo);
  const agrupado = vista.agrupar !== null;

  const resultado = useMemo(
    () => aplicarVista(def, filas, filtros, vista.mostrarCerrados),
    [def, filas, filtros, vista.mostrarCerrados]
  );
  const { limiteSinFiltros, porPagina } = opciones;

  // Página pedida: vale solo mientras no cambien los filtros, los cerrados ni los grupos; si cambian, se vuelve a la 1.
  const firmaPagina = JSON.stringify([filtros, vista.mostrarCerrados, vista.agrupar]);
  const [paginaPedida, setPaginaPedida] = useState<{ firma: string; pagina: number }>({ firma: "", pagina: 1 });
  const paginado = porPagina !== undefined && !hayFiltros && !agrupado;
  const paginacion = useMemo(
    () =>
      paginado
        ? calcularPagina(resultado.filas.length, porPagina, paginaPedida.firma === firmaPagina ? paginaPedida.pagina : 1)
        : null,
    [paginado, porPagina, resultado.filas.length, paginaPedida, firmaPagina]
  );
  const irAPagina = (pagina: number) => setPaginaPedida({ firma: firmaPagina, pagina });

  const visibles = useMemo(() => {
    if (paginacion) return resultado.filas.slice(paginacion.inicio, paginacion.fin);
    return hayFiltros || agrupado || limiteSinFiltros === undefined
      ? resultado.filas
      : resultado.filas.slice(0, limiteSinFiltros);
  }, [resultado.filas, paginacion, hayFiltros, agrupado, limiteSinFiltros]);
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
    /** Cuál página se ve y de cuántas; `null` si la tabla no está paginada (con filtros, grupos o sin `porPagina`). */
    paginacion,
    irAPagina,
    grupos,
    contraidos,
    alternarGrupo,
    contraerTodos,
    expandirTodos,
  };
}

export type TablaInteractiva<F> = ReturnType<typeof useTablaInteractiva<F>>;
