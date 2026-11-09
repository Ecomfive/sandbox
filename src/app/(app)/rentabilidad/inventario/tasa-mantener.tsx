"use client";

import { useState, useTransition } from "react";
import { fieldClassSm, labelClassSm, anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { claseCifra } from "@/components/af4/estilos-af4";
import { guardarTasaMantener } from "./actions";

/** La tasa anual del costo de mantener inventario, editable en su sitio (Guardar aparece solo con un cambio). */
export function TasaMantener({ tasa }: { tasa: number }) {
  const inicial = String(Math.round(tasa * 10_000) / 100);
  const [valor, setValor] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const cambio = valor.trim() !== inicial;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarTasaMantener(valor).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Tasa guardada");
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Tasa anual de mantener (%)</span>
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={`${fieldClassSm} w-28 text-right ${claseCifra}`}
          placeholder="Ej: 20"
        />
      </label>
      {cambio && (
        <button
          type="submit"
          disabled={pendiente}
          className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
        >
          Guardar
        </button>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
    </form>
  );
}
