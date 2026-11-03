"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { agregarNotaPedido } from "../actions";

/** Escribir una nota interna en el pedido (no va a Shopify). */
export function NotaPedido({ pedidoId }: { pedidoId: string }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        empezar(async () => {
          const r = await agregarNotaPedido(pedidoId, texto);
          setError(r.error ?? null);
          if (!r.error) setTexto("");
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Nota interna (no se manda a Shopify)
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} className={`${fieldClass} resize-y`} />
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
  );
}
