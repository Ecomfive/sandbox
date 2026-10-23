"use client";

import type { ReactNode } from "react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import type { DefTabla } from "@/lib/tabla/motor";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { BarraHerramientas } from "./barra-herramientas";
import type { IconoComp } from "./botones-vista";
import { EncabezadoGrupoBloque } from "./encabezado-grupo";
import { Paginacion } from "./paginacion";
import { POR_PAGINA, textoEstadoTabla, useIrAPaginaArriba } from "./usar-pagina-arriba";
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
  porPagina = POR_PAGINA,
  accionPrincipal,
  variante = "tarjetas",
  encabezado,
  vacio,
}: {
  def: DefTabla<F>;
  filas: F[];
  iconos: Record<string, IconoComp>;
  nombre: NombreFilas;
  claveFila: (fila: F) => string;
  /** Dibuja una fila; recibe también las filas en el orden en que se ven (para pasar a la anterior y la siguiente de una ficha). */
  renderFila: (fila: F, enOrden: F[]) => ReactNode;
  etiquetaGrupo?: (campo: string, grupo: Grupo<F>) => ReactNode;
  formatearTotal?: (total: number) => string;
  /** Bloque entre la barra y la lista que necesita saber qué filas se ven (p. ej. seleccionar todas). */
  encima?: (visibles: F[]) => ReactNode;
  /** Tarjetas por página cuando no hay filtros ni grupos (50 por defecto); con menos que eso no se ve la paginación. */
  porPagina?: number;
  /** El botón «Agregar» del módulo (`FichaCrear`), al final de la fila de botones de la barra, junto a Descargar. */
  accionPrincipal?: ReactNode;
  /**
   * `tarjetas` (por defecto): cada fila es su propia tarjeta. `filas`: las filas van juntas en una sola tarjeta, separadas por una
   * línea fina, como una lista (una fila la dibuja `renderFila` sin borde propio).
   */
  variante?: "tarjetas" | "filas";
  /**
   * Solo con `variante="filas"`: la franja con el nombre de cada columna, encima de las filas (de cada grupo, si se agrupa). Queda
   * fija arriba al bajar la página mientras se vean filas de esa lista. Quien la pasa la dibuja con las mismas columnas que sus filas.
   */
  encabezado?: ReactNode;
  vacio: string;
}) {
  const tabla = useTablaInteractiva(def, filas, { porPagina });
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado, paginacion } = tabla;
  const { raiz, alIrA } = useIrAPaginaArriba(tabla.irAPagina);

  // Las filas como se ven, de arriba abajo: con grupos, en el orden de los grupos y sin las de un grupo contraído.
  const enOrden = vista.agrupar ? grupos.filter((g) => !contraidos.has(g.clave)).flatMap((g) => g.filas) : visibles;
  const dibujar = (f: F) => <div key={claveFila(f)}>{renderFila(f, enOrden)}</div>;
  const juntas = (filasDelGrupo: F[]) =>
    variante === "filas" ? (
      // Con encabezado, la franja va FUERA de la lista (un `overflow-hidden` no deja que algo se quede fijo dentro de él) y las dos
      // comparten esta caja, que es lo que marca hasta dónde baja la franja fija.
      <div className="flex flex-col">
        {encabezado && <div className="sticky top-0 z-[15] rounded-t-xl border border-b-0 border-border bg-muted">{encabezado}</div>}
        <ul role="list" className={`m-0 flex list-none flex-col divide-y divide-border overflow-hidden border border-border bg-card p-0 ${encabezado ? "rounded-b-xl" : "rounded-xl"}`}>
          {filasDelGrupo.map((f) => (
            <li key={claveFila(f)}>{renderFila(f, enOrden)}</li>
          ))}
        </ul>
      </div>
    ) : (
      filasDelGrupo.map(dibujar)
    );

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
    <div ref={raiz} className="flex flex-col gap-3">
      <div className="min-w-0 rounded-xl border border-border bg-card [&>div]:border-b-0">
        <BarraHerramientas
          def={def}
          filas={filas}
          tabla={tabla}
          iconos={iconos}
          nombreFilas={nombre.plural}
          accionPrincipal={accionPrincipal}
        />
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
                {!contraido && juntas(grupo.filas)}
              </section>
            );
          })
        : juntas(visibles)}

      {paginacion && (
        // La paginación trae su propio borde superior; aquí va en su propia tarjeta, así que se quita.
        <div className="rounded-xl border border-border bg-card [&>nav]:border-t-0">
          <Paginacion pagina={paginacion} nombre={nombre} alIrA={alIrA} />
        </div>
      )}
      <p role="status" className="sr-only">
        {filas.length > 0 ? textoEstadoTabla(nombre, paginacion ? paginacion.total : visibles.length, paginacion) : ""}
      </p>
      {notas.length > 0 && <p className="px-1 text-xs text-muted-foreground">{notas.join(" · ")}</p>}
    </div>
  );
}
