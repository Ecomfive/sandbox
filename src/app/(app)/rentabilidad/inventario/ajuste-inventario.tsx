"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AJUSTES_EDITABLES, type AjusteEditable } from "@/lib/finanzas/inventario-decisiones";
import { guardarAjusteInventario } from "./actions";

/**
 * Un ajuste de las decisiones de inventario (días de sobrestock, alza de costo que alerta, días de seguridad o de
 * cobertura), editable en su sitio como la tasa de mantener: «Guardar» aparece solo con un cambio. `valor` va en la unidad
 * que se ve (días, o % para la alerta de costo).
 */
export function AjusteInventario({ clave, valor: inicialNum }: { clave: AjusteEditable; valor: number }) {
  const inicial = String(inicialNum);
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
          const r = await guardarAjusteInventario(clave, valor).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Ajuste guardado");
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>{AJUSTES_EDITABLES[clave].etiqueta}</span>
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={`${fieldClassSm} w-28 text-right ${claseCifra}`}
          placeholder={`Ej: ${AJUSTES_EDITABLES[clave].min * 2}`}
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
