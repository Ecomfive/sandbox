"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { guardarFulfillmentPais } from "./fulfillment-actions";

/**
 * «Fulfillment por pedido» del país, arriba de Bodegas (pedido de Hernán, 31 oct 2026): cuánto cuesta el fulfillment de cada pedido en este país.
 * Al guardarlo, todas las publicaciones del país en Gestión de IDs Dropi lo toman (su margen se recalcula) y las nuevas lo traen. Vacío = se
 * escribe en cada publicación. `valor` null sin la migración 0208 o si el país no tiene uno.
 */
export function FulfillmentPais({ paisId, nombrePais, valor, puedeEscribir, falta }: { paisId: string; nombrePais: string; valor: number | null; puedeEscribir: boolean; falta: boolean }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(valor === null ? "" : valor.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiado = texto.trim().replace(",", ".") !== (valor === null ? "" : valor.toFixed(2)) && Number(texto.replace(",", ".")) !== valor;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cambiado || pendiente) return;
    const nuevo = texto.trim();
    const aviso = nuevo
      ? `El fulfillment de ${nombrePais} pasa a $${Number(nuevo.replace(",", ".")).toFixed(2)} y se pone en todas sus publicaciones de Gestión de IDs Dropi (cambia su margen). ¿Seguir?`
      : `${nombrePais} se queda sin fulfillment fijo: se vuelve a escribir en cada publicación. ¿Seguir?`;
    if (!confirm(aviso)) return;
    setError(null);
    empezar(async () => {
      const r = await guardarFulfillmentPais(paisId, nuevo).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      setTexto(r.valor === null ? "" : r.valor.toFixed(2));
      mostrarToast(
        r.valor === null
          ? `${nombrePais}: el fulfillment se escribe en cada publicación.`
          : `Fulfillment de ${nombrePais}: $${r.valor.toFixed(2)}${r.cambiadas ? ` · se cambió en ${r.cambiadas} ${r.cambiadas === 1 ? "publicación" : "publicaciones"}` : " · todas las publicaciones ya lo tenían"}.`,
      );
    });
  }

  return (
    <section aria-labelledby="t-fulfillment" className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <h2 id="t-fulfillment" className="m-0 text-base font-semibold">
          Fulfillment por pedido en {nombrePais}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          Lo que cuesta el fulfillment de cada pedido en este país. Se pone solo en todas las publicaciones de {nombrePais} en Gestión de IDs Dropi (y en las nuevas), y con él se calcula
          su margen. Vacío: se escribe en cada publicación.
        </p>
        {falta && <p className="m-0 text-sm text-warning">Falta correr la migración 0208 (fulfillment por país) en la base.</p>}
      </div>
      <form onSubmit={guardar} className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Dólares por pedido</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              $
            </span>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              inputMode="decimal"
              placeholder="Ej: 2.00"
              disabled={!puedeEscribir || falta || pendiente}
              aria-describedby={error ? "error-fulfillment" : undefined}
              className={`${fieldClass} w-28 tabular-nums disabled:cursor-not-allowed disabled:bg-muted`}
            />
          </span>
        </label>
        {puedeEscribir && (
          <button
            type="submit"
            disabled={!cambiado || pendiente || falta}
            className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        )}
      </form>
      {error && (
        <p id="error-fulfillment" role="alert" className="m-0 w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
