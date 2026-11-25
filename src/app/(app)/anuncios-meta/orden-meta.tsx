"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { fieldClassSm } from "@/components/ui/field";
import { MAX_ORDENES, ordenValido, siguienteCriterio, type CriterioOrden, type Orden } from "@/lib/meta-ads/orden";

/** El orden que cada persona eligió para una lista, guardado en su navegador (sin almacenamiento queda el de siempre). */
const prefijo = "anuncios-meta-orden-";
const oyentes = new Set<() => void>();
const enMemoria = new Map<string, Orden[]>();
const cache = new Map<string, { crudo: string; valor: Orden[] }>();

function leer(lista: string, claves: readonly string[], porDefecto: Orden[]): Orden[] {
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
    valor = ordenValido(JSON.parse(crudo), claves, porDefecto);
  } catch {
    valor = porDefecto;
  }
  cache.set(lista, { crudo, valor });
  return valor;
}

export function useOrdenMeta<F>(lista: string, criterios: readonly CriterioOrden<F>[], porDefecto: Orden[]): [Orden[], (o: Orden[]) => void] {
  const claves = criterios.map((c) => c.valor);
  const ordenes = useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      window.addEventListener("storage", avisar);
      return () => {
        oyentes.delete(avisar);
        window.removeEventListener("storage", avisar);
      };
    },
    () => leer(lista, claves, porDefecto),
    () => porDefecto,
  );
  const guardar = useCallback(
    (nuevo: Orden[]) => {
      enMemoria.set(lista, nuevo);
      try {
        window.localStorage.setItem(`${prefijo}${lista}-v1`, JSON.stringify(nuevo));
      } catch {
        /* sin almacenamiento: queda en esta pestaña */
      }
      oyentes.forEach((f) => f());
    },
    [lista],
  );
  return [ordenes, guardar];
}

const boton = "inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

const textoDelSentido = (criterio: string, sentido: "asc" | "desc") => (criterio === "nombre" ? (sentido === "asc" ? "A → Z" : "Z → A") : criterio === "creada" ? (sentido === "asc" ? "Más antiguas primero" : "Más nuevas primero") : sentido === "asc" ? "De menor a mayor ↑" : "De mayor a menor ↓");

/** «Ordenar por» con su sentido y, si la persona quiere, hasta dos «luego por» que desempatan. Las métricas vienen agrupadas. */
function SelectorOrden<F>({ criterios, ordenes, alCambiar }: { criterios: readonly CriterioOrden<F>[]; ordenes: Orden[]; alCambiar: (o: Orden[]) => void }) {
  const grupos = [...new Set(criterios.map((c) => c.grupo))];
  const nuevo = siguienteCriterio(criterios, ordenes);
  const cambiar = (i: number, o: Orden) => alCambiar(ordenes.map((x, j) => (j === i ? o : x)));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {ordenes.map((o, i) => {
        const titulo = i === 0 ? "Ordenar por" : "Luego por";
        const nombre = criterios.find((c) => c.valor === o.criterio)?.etiqueta ?? o.criterio;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <label className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto">
              <span className="w-[5.25rem] shrink-0 text-xs font-medium text-muted-foreground">{titulo}</span>
              <select
                value={o.criterio}
                onChange={(e) => {
                  const c = criterios.find((x) => x.valor === e.target.value);
                  if (c) cambiar(i, { criterio: c.valor, sentido: c.sentido });
                }}
                className={`${fieldClassSm} min-h-9 min-w-0 flex-1 sm:w-auto sm:min-w-[13rem] sm:flex-none`}
              >
                {grupos.map((g) => (
                  <optgroup key={g} label={g}>
                    {criterios
                      .filter((c) => c.grupo === g)
                      .map((c) => (
                        // Un criterio ya usado en otra línea no se ofrece de nuevo.
                        <option key={c.valor} value={c.valor} disabled={ordenes.some((x, j) => j !== i && x.criterio === c.valor)}>
                          {c.etiqueta}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => cambiar(i, { ...o, sentido: o.sentido === "asc" ? "desc" : "asc" })} aria-label={`Cambiar el sentido de «${nombre}»: ahora va ${textoDelSentido(o.criterio, o.sentido).replace(/[↑↓]/g, "").trim().toLowerCase()}`} className={boton}>
              {textoDelSentido(o.criterio, o.sentido)}
            </button>
            {i > 0 && (
              <button type="button" onClick={() => alCambiar(ordenes.filter((_, j) => j !== i))} aria-label={`Quitar «luego por ${nombre}»`} className={`${boton} w-9 justify-center px-0`}>
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        );
      })}
      {nuevo && ordenes.length < MAX_ORDENES && (
        <button type="button" onClick={() => alCambiar([...ordenes, nuevo])} className={`${boton} w-fit`}>
          + Agregar otro orden
        </button>
      )}
    </div>
  );
}

/** La franja de una lista: el orden a la izquierda y, a la derecha, lo propio de esa lista (columnas, tarjetas o lista). */
export function BarraOrden<F>({ criterios, ordenes, alCambiar, children }: { criterios: readonly CriterioOrden<F>[]; ordenes: Orden[]; alCambiar: (o: Orden[]) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <SelectorOrden criterios={criterios} ordenes={ordenes} alCambiar={alCambiar} />
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
