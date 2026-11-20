"use client";

import { useState } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon } from "@/lib/nav-icons";
import { limpiarEtiqueta } from "@/lib/tienda/etiquetas-shopify";

/**
 * Las etiquetas de Shopify del pedido, arriba de la ficha (19 nov 2026, etapa 1 de escribir en Shopify). Con la escritura encendida en la tienda, cada
 * etiqueta tiene su × para quitarla, hay un campo para agregar (con las que más usa la tienda como sugerencia) y botones rápidos con las más usadas.
 * El cambio va primero a Shopify (`cambiarEtiquetasPedido`): mientras tanto todo queda quieto.
 */
export function EtiquetasPedido({
  ordenId,
  etiquetas,
  sugeridas,
  activa,
  motivo,
  pendiente,
  onCambiar,
}: {
  ordenId: string;
  etiquetas: string[];
  sugeridas: string[];
  activa: boolean;
  motivo: string | null;
  pendiente: boolean;
  onCambiar: (agregar: string[], quitar: string[], hecho: string) => void;
}) {
  const [nueva, setNueva] = useState("");
  const tiene = new Set(etiquetas.map((e) => e.toLowerCase()));
  const rapidas = sugeridas.filter((s) => !tiene.has(s.toLowerCase())).slice(0, 5);
  const listaId = `etiquetas-sugeridas-${ordenId}`;

  function agregar(e: React.FormEvent) {
    e.preventDefault();
    const t = limpiarEtiqueta(nueva);
    if (!t) return;
    onCambiar([t], [], `Etiqueta «${t}» agregada en Shopify.`);
    setNueva("");
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-5 py-3" aria-busy={pendiente}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Etiquetas de Shopify</span>
        {etiquetas.length === 0 && <span className="text-xs text-muted-foreground">Sin etiquetas</span>}
        {etiquetas.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full border border-primario/30 bg-primario-suave px-2 py-0.5 text-xs font-medium">
            {e}
            {activa && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => onCambiar([], [e], `Etiqueta «${e}» quitada en Shopify.`)}
                aria-label={`Quitar la etiqueta ${e}`}
                className={`-mr-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-primario/15 hover:text-foreground disabled:opacity-50 ${anilloFoco}`}
              >
                <CerrarIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {!activa && motivo && (
          <Tooltip texto={motivo}>
            <span className="ml-1 text-xs text-muted-foreground underline decoration-dotted">Solo lectura</span>
          </Tooltip>
        )}
      </div>
      {activa && (
        <div className="flex flex-wrap items-center gap-1.5">
          <form onSubmit={agregar} className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`${listaId}-campo`}>
              Agregar etiqueta
            </label>
            <input
              id={`${listaId}-campo`}
              list={listaId}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              maxLength={40}
              placeholder="Agregar etiqueta"
              disabled={pendiente}
              className={`${fieldClassSm} w-44`}
            />
            <datalist id={listaId}>
              {sugeridas.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button type="submit" disabled={pendiente || !limpiarEtiqueta(nueva)} className="inline-flex min-h-7 items-center rounded-md bg-primario px-2.5 text-xs font-semibold text-white disabled:opacity-50">
              {pendiente ? "Guardando…" : "Agregar"}
            </button>
          </form>
          {rapidas.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pendiente}
              onClick={() => onCambiar([s], [], `Etiqueta «${s}» agregada en Shopify.`)}
              className={`rounded-full border border-dashed border-primario/40 px-2 py-0.5 text-xs text-primario hover:bg-primario-suave disabled:opacity-50 ${anilloFoco}`}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
