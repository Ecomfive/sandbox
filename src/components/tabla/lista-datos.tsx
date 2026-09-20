"use client";

import type { ReactNode } from "react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import type { DefTabla } from "@/lib/tabla/motor";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { BarraHerramientas } from "./barra-herramientas";
import type { IconoComp } from "./botones-vista";
import { EncabezadoGrupoBloque } from "./encabezado-grupo";
import { useTablaInteractiva } from "./usar-tabla";

/**
 * Lista de tarjetas (cada una con su propio formulario) con la barra de herramientas común: agrupar, filas
 * cerradas y filtros. No lleva menú de columnas porque no hay columnas. La barra va en su propia tarjeta,
 * encima de la lista.
 */
export function ListaDatos<F>({
  def,
  filas,
  iconos,
  nombre,
  claveFila,
  renderFila,
  etiquetaGrupo,
  formatearTotal,
  encima,
  vacio,
}: {
  def: DefTabla<F>;
  filas: F[];
  iconos: Record<string, IconoComp>;
  nombre: NombreFilas;
  claveFila: (fila: F) => string;
  renderFila: (fila: F) => ReactNode;
  etiquetaGrupo?: (campo: string, grupo: Grupo<F>) => ReactNode;
  formatearTotal?: (total: number) => string;
  /** Bloque entre la barra y la lista que necesita saber qué filas se ven (p. ej. seleccionar todas). */
  encima?: (visibles: F[]) => ReactNode;
  vacio: string;
}) {
  const tabla = useTablaInteractiva(def, filas);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado } = tabla;

  const notas = notasPie({
    hayFiltros,
    agrupado,
    visibles: visibles.length,
    base: resultado.base.length,
    grupos: grupos.length,
    nombre,
    cerradosVisibles: resultado.cerradosVisibles,
    cerradosOcultos: resultado.cerradosOcultos,
    etiquetaCerrados: def.cerrados?.etiqueta,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 rounded-xl border border-border bg-card [&>div]:border-b-0">
        <BarraHerramientas def={def} filas={filas} tabla={tabla} iconos={iconos} nombreFilas={nombre.plural} />
      </div>

      {visibles.length > 0 && encima?.(visibles)}

      {filas.length === 0 && <EstadoVacio mensaje={vacio} />}
      {filas.length > 0 && visibles.length === 0 && (
        <EstadoVacio
          mensaje={
            hayFiltros
              ? "Ninguno coincide con los filtros."
              : `Todos están ocultos. Pulsa «${def.cerrados?.etiqueta ?? "Cerrados"}» para ver los ${resultado.cerradosOcultos}.`
          }
        />
      )}

      {vista.agrupar
        ? grupos.map((grupo) => {
            const contraido = contraidos.has(grupo.clave);
            return (
              <section key={grupo.clave} className="flex flex-col gap-3">
                <EncabezadoGrupoBloque
                  contraido={contraido}
                  alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                  etiqueta={etiquetaGrupo?.(vista.agrupar!, grupo) ?? <span className="font-semibold">{grupo.etiqueta}</span>}
                  cantidad={grupo.filas.length}
                  nombre={nombre}
                  total={formatearTotal ? formatearTotal(grupo.total) : undefined}
                />
                {!contraido && grupo.filas.map((f) => <div key={claveFila(f)}>{renderFila(f)}</div>)}
              </section>
            );
          })
        : visibles.map((f) => <div key={claveFila(f)}>{renderFila(f)}</div>)}

      <p role="status" className="sr-only">
        {filas.length > 0 ? `${visibles.length} ${visibles.length === 1 ? nombre.singular : nombre.plural}` : ""}
      </p>
      {notas.length > 0 && <p className="px-1 text-xs text-muted-foreground">{notas.join(" · ")}</p>}
    </div>
  );
}
