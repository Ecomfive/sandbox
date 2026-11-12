"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { formatearFechaHora } from "@/lib/formato";
import type { NotaOrden } from "@/lib/tienda/orden-detalle";
import { agregarNotaOrden } from "../actions";

/**
 * Las notas del equipo en un pedido de tienda (12 nov 2026, como en Mi Reto Digital): quién la escribió, cuándo y qué dice. Quedan solo en el sistema
 * (`ven_orden_notas`); nunca se mandan a Shopify. La nota nueva se suma a la lista sin recargar la ficha.
 */
export function NotasOrden({ ordenId, notas: iniciales, puedeEscribir }: { ordenId: string; notas: NotaOrden[]; puedeEscribir: boolean }) {
  const [nuevas, setNuevas] = useState<NotaOrden[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const notas = [...iniciales, ...nuevas.filter((n) => !iniciales.some((i) => i.id === n.id))];
  return (
    <div className="flex flex-col gap-3">
      {notas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Todavía no hay notas en este pedido.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {notas.map((n) => (
            <li key={n.id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="block text-xs text-muted-foreground">
                <b className="font-semibold text-foreground">{n.autor ?? "Alguien del equipo"}</b> · {formatearFechaHora(n.creado_en)}
              </span>
              <span className="block whitespace-pre-line break-words">{n.texto}</span>
            </li>
          ))}
        </ol>
      )}
      {puedeEscribir ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            empezar(async () => {
              const r = await agregarNotaOrden(ordenId, texto);
              if ("error" in r) {
                setError(r.error);
                return;
              }
              setError(null);
              setTexto("");
              setNuevas((v) => [...v, r.nota]);
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Nota para el equipo (no se manda a Shopify)
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} className={`${fieldClass} resize-y`} />
          </label>
          {error && (
            <p role="alert" className="m-0 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" variant="secondary" disabled={guardando || !texto.trim()} className="self-start">
            {guardando ? "Guardando…" : "Guardar nota"}
          </Button>
        </form>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">Tu rol solo puede leer los pedidos.</p>
      )}
    </div>
  );
}
