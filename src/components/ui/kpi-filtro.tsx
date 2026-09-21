"use client";

import type { ReactNode } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { DefTabla } from "@/lib/tabla/motor";
import { ContenidoKpi, claseKpi } from "./kpi-card";

/**
 * Una tarjeta de indicador que **filtra la tabla de la misma página**: al pulsarla pone el filtro del atajo (y al
 * pulsarla otra vez lo quita, dejando la tabla sin filtrar), sin recargar. Con un atajo `suma` se pueden pulsar varias
 * a la vez (varios estados: «uno u otro»). Comparte el almacén de filtros de la tabla (`def.clave`), así que la
 * tabla y el botón «Filtros» de su barra la reflejan al instante. Es un botón con `aria-pressed`; la que está
 * filtrando lleva el borde marcado. Va en un componente de cliente del módulo (que importa su propia `def`,
 * porque una definición con funciones no cruza de un Server Component a uno de cliente).
 */
export function KpiFiltro<F>({
  def,
  atajo,
  titulo,
  valor,
  subtexto,
  tono = "neutral",
  compacta = false,
  children,
}: {
  def: DefTabla<F>;
  atajo: AtajoFiltro;
  titulo?: ReactNode;
  valor: ReactNode;
  subtexto?: ReactNode;
  tono?: "neutral" | "destructive";
  /** Menos relleno: para tarjetas dentro de un `KpiGrid compacta`. */
  compacta?: boolean;
  children?: ReactNode;
}) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  const activo = atajoActivo(filtros, atajo);
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => cambiarFiltros(alternarAtajo(filtros, atajo))}
      className={claseKpi(tono, true, activo, compacta)}
    >
      <ContenidoKpi
        titulo={titulo}
        valor={valor}
        subtexto={subtexto}
        tono={tono}
        ayudaLectores={activo ? `Filtrando la tabla: ${atajo.etiqueta}. Pulsa para quitar el filtro.` : atajo.ayuda}
      >
        {children}
      </ContenidoKpi>
    </button>
  );
}
