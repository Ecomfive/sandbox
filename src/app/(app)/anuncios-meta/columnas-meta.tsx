"use client";

import { useCallback, useId, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Ventana } from "@/components/ui/ventana";
import { FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import { CATALOGO_COLUMNAS, columnasValidas, defDeColumna, GRUPOS_COLUMNA, moverColumna, PRESETS_COLUMNAS, rejillaDeColumnas, valorColumna, type ClaveColumna, type ContextoColumna } from "@/lib/meta-ads/columnas";
import type { Resultados } from "@/lib/meta-ads/metricas";
import { Nivel } from "./piezas";

/** Las columnas que cada persona eligió para una lista, guardadas en su navegador (sin almacenamiento, quedan las de siempre). Vale en todas las pestañas abiertas. */
const prefijo = "anuncios-meta-columnas-";
const oyentes = new Set<() => void>();
const enMemoria = new Map<string, ClaveColumna[]>();
const cache = new Map<string, { crudo: string | null; valor: ClaveColumna[] }>();

function leer(lista: string, porDefecto: ClaveColumna[]): ClaveColumna[] {
  let crudo: string | null = null;
  try {
    crudo = window.localStorage.getItem(`${prefijo}${lista}-v1`);
  } catch {
    /* sin almacenamiento */
  }
  if (crudo === null) return enMemoria.get(lista) ?? porDefecto;
  const previo = cache.get(lista);
  if (previo && previo.crudo === crudo) return previo.valor;
  let valor = porDefecto;
  try {
    valor = columnasValidas(JSON.parse(crudo), porDefecto);
  } catch {
    valor = porDefecto;
  }
  cache.set(lista, { crudo, valor });
  return valor;
}

export function useColumnasMeta(lista: string, porDefecto: ClaveColumna[]): [ClaveColumna[], (c: ClaveColumna[]) => void, () => void] {
  const columnas = useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      window.addEventListener("storage", avisar);
      return () => {
        oyentes.delete(avisar);
        window.removeEventListener("storage", avisar);
      };
    },
    () => leer(lista, porDefecto),
    () => porDefecto,
  );
  const guardar = useCallback(
    (nuevas: ClaveColumna[]) => {
      enMemoria.set(lista, nuevas);
      try {
        window.localStorage.setItem(`${prefijo}${lista}-v1`, JSON.stringify(nuevas));
      } catch {
        /* sin almacenamiento: queda en esta pestaña */
      }
      oyentes.forEach((f) => f());
    },
    [lista],
  );
  const restablecer = useCallback(() => {
    enMemoria.delete(lista);
    cache.delete(lista);
    try {
      window.localStorage.removeItem(`${prefijo}${lista}-v1`);
    } catch {
      /* sin almacenamiento */
    }
    oyentes.forEach((f) => f());
  }, [lista]);
  return [columnas, guardar, restablecer];
}

const boton = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";
const botonIcono = "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-control bg-card hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40";

/** El botón «Columnas» de una lista de Anuncios Meta y la ventana donde se eligen, se ordenan o se cambian por un conjunto listo. */
export function SelectorColumnasMeta({ titulo, columnas, alCambiar, alRestablecer, sinFrecuencia = false }: { titulo: string; columnas: ClaveColumna[]; alCambiar: (c: ClaveColumna[]) => void; alRestablecer: () => void; sinFrecuencia?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const disponibles = useMemo(() => CATALOGO_COLUMNAS.filter((c) => !columnas.includes(c.clave) && !(sinFrecuencia && c.clave === "frecuencia")), [columnas, sinFrecuencia]);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={boton} aria-haspopup="dialog">
        Columnas <span className="font-normal text-muted-foreground">({columnas.length})</span>
      </button>
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo={`Columnas de ${titulo}`} lado="derecha" ancho="md">
        <div className="flex flex-col gap-5 px-5 py-5">
          <section aria-labelledby={`${id}-presets`} className="flex flex-col gap-2">
            <h3 id={`${id}-presets`} className="m-0 text-sm font-semibold">
              Conjuntos listos
            </h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS_COLUMNAS.map((p) => (
                <button key={p.id} type="button" onClick={() => alCambiar(p.columnas.filter((c) => !(sinFrecuencia && c === "frecuencia")))} className={boton}>
                  {p.titulo}
                </button>
              ))}
              <button type="button" onClick={alRestablecer} className={boton}>
                Restablecer
              </button>
            </div>
          </section>

          <section aria-labelledby={`${id}-en-pantalla`} className="flex flex-col gap-2">
            <h3 id={`${id}-en-pantalla`} className="m-0 text-sm font-semibold">
              En pantalla, en este orden
            </h3>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {columnas.map((c, i) => (
                <li key={c} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{defDeColumna(c).titulo}</span>
                  <button type="button" aria-label={`Subir ${defDeColumna(c).titulo}`} aria-disabled={i === 0} onClick={() => i > 0 && alCambiar(moverColumna(columnas, c, -1))} className={botonIcono}>
                    <FlechaArribaIcon className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Bajar ${defDeColumna(c).titulo}`} aria-disabled={i === columnas.length - 1} onClick={() => i < columnas.length - 1 && alCambiar(moverColumna(columnas, c, 1))} className={botonIcono}>
                    <FlechaAbajoIcon className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Quitar ${defDeColumna(c).titulo}`} aria-disabled={columnas.length === 1} onClick={() => columnas.length > 1 && alCambiar(columnas.filter((x) => x !== c))} className={botonIcono}>
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {disponibles.length > 0 && (
            <section aria-labelledby={`${id}-mas`} className="flex flex-col gap-3">
              <h3 id={`${id}-mas`} className="m-0 text-sm font-semibold">
                Agregar
              </h3>
              {GRUPOS_COLUMNA.map((g) => {
                const delGrupo = disponibles.filter((c) => c.grupo === g);
                if (!delGrupo.length) return null;
                return (
                  <div key={g} className="flex flex-col gap-1.5">
                    <p className="m-0 text-xs font-medium text-muted-foreground">{g}</p>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {delGrupo.map((c) => (
                        <li key={c.clave} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{c.titulo}</span>
                            <span className="block text-xs text-muted-foreground">{c.descripcion}</span>
                          </span>
                          <button type="button" aria-label={`Agregar ${c.titulo}`} onClick={() => alCambiar([...columnas, c.clave])} className={botonIcono}>
                            <span aria-hidden="true">+</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      </Ventana>
    </>
  );
}

/** Estilo de la rejilla de una lista con N columnas elegidas: el nombre, las métricas y la flecha (en pantalla ancha; más angosta, cada fila apila sus cifras). */
export function estiloRejilla(n: number, conExtra = false): CSSProperties {
  return { "--columnas-meta": rejillaDeColumnas(n, conExtra) } as CSSProperties;
}

/** Los títulos de las columnas elegidas, a la derecha del nombre. */
export function EncabezadoColumnas({ nombre, columnas, minimo = "xl", extra }: { nombre: string; columnas: ClaveColumna[]; minimo?: "lg" | "xl"; /** Una columna de texto entre el nombre y las métricas (el «Tipo» de las campañas). */ extra?: string }) {
  return (
    <div aria-hidden="true" style={estiloRejilla(columnas.length, !!extra)} className={`hidden gap-3 px-4 py-2 text-xs font-medium text-muted-foreground ${minimo === "xl" ? "xl:grid xl:[grid-template-columns:var(--columnas-meta)]" : "lg:grid lg:[grid-template-columns:var(--columnas-meta)]"}`}>
      <span>{nombre}</span>
      {extra && <span>{extra}</span>}
      {columnas.map((c) => (
        <span key={c} className="text-right">
          {defDeColumna(c).titulo}
        </span>
      ))}
      <span />
    </div>
  );
}

/** Las celdas de una fila para las columnas elegidas. En pantalla angosta cada una dice su nombre; en la ancha lo dice el encabezado. */
export function CeldasColumnas({ columnas, r, ctx, minimo = "xl" }: { columnas: ClaveColumna[]; r: Resultados; ctx: ContextoColumna; minimo?: "lg" | "xl" }) {
  return (
    <>
      {columnas.map((c) => {
        const v = valorColumna(c, r, ctx);
        return (
          <span key={c} className={`flex items-baseline justify-between gap-2 text-sm tabular-nums ${minimo === "xl" ? "xl:block xl:text-right" : "lg:block lg:text-right"}`}>
            <span className={`text-xs text-muted-foreground ${minimo === "xl" ? "xl:sr-only" : "lg:sr-only"}`}>{defDeColumna(c).titulo}</span>
            <Nivel nivel={v.nivel}>{v.texto}</Nivel>
          </span>
        );
      })}
    </>
  );
}
