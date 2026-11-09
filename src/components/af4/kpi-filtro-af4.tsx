"use client";

import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { claseKpi } from "@/components/ui/kpi-card";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { DefTabla } from "@/lib/tabla/motor";
import { ContenidoKpiAF4, type PropsContenidoKpiAF4 } from "./kpi-af4";

/**
 * Un KPI ejecutivo del Portal AF4 que **filtra la tabla de la misma página** (como `KpiFiltro`, con el aspecto de
 * `KpiAF4`): al pulsarlo pone el filtro del atajo y al pulsarlo otra vez lo quita. Es un botón con `aria-pressed` y
 * comparte el almacén de filtros de la tabla (`def.clave`). Va en un componente de cliente del módulo, que importa su
 * propia `def`.
 */
export function KpiFiltroAF4<F>({ def, atajo, ...props }: PropsContenidoKpiAF4 & { def: DefTabla<F>; atajo: AtajoFiltro }) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  const activo = atajoActivo(filtros, atajo);
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => cambiarFiltros(alternarAtajo(filtros, atajo))}
      className={`${claseKpi(props.tono ?? "neutral", true, activo)} text-left`}
    >
      <ContenidoKpiAF4 {...props} />
      {/* Presionado, el lector ya dice «presionado»: solo se explica qué hace cuando está apagado. */}
      {!activo && atajo.ayuda && <span className="sr-only">{atajo.ayuda}</span>}
    </button>
  );
}

/**
 * Botones pequeños que ponen o quitan un filtro de la tabla de la página (los tramos de antigüedad en la franja de su
 * gráfica). Se pueden juntar si los atajos llevan `suma`.
 */
export function FiltrosRapidosAF4<F>({ def, atajos, etiqueta }: { def: DefTabla<F>; atajos: AtajoFiltro[]; etiqueta: string }) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap items-center gap-1">
      {atajos.map((a) => {
        const activo = atajoActivo(filtros, a);
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={activo}
            onClick={() => cambiarFiltros(alternarAtajo(filtros, a))}
            className={`h-7 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors ${anilloFoco} ${
              activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-foreground hover:bg-muted"
            }`}
          >
            {a.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
