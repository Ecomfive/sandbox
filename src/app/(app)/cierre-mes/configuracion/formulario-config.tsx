"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ConfigCierre } from "@/lib/finanzas/cierre-control";
import { guardarConfigCierre } from "../control-actions";

/** Los ajustes del cierre de mes. Sin permiso, los campos se ven pero no se cambian. */
export function FormularioConfigCierre({ config, editable }: { config: ConfigCierre; editable: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const campo = (name: string, etiqueta: string, valor: number, opciones: { min: number; max: number; paso?: string }) => (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{etiqueta}</span>
      <input name={name} type="number" min={opciones.min} max={opciones.max} step={opciones.paso ?? "1"} defaultValue={valor} required className={fieldClass} />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await guardarConfigCierre(datos);
          if (r.error) return setError(r.error);
          mostrarToast("Ajustes del cierre guardados");
          router.refresh();
        });
      }}
      className="flex max-w-2xl flex-col gap-4"
    >
      <fieldset disabled={!editable || enviando} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Ajustes del cierre</legend>
        {campo("dia_habil", "Día hábil del mes siguiente para cerrar", config.diaHabil, { min: 1, max: 20 })}
        <span />
        {campo("umbral_pct", "Variación que pide explicación (%)", config.umbralPct, { min: 0, max: 1000, paso: "0.1" })}
        {campo("umbral_monto", "Y además al menos (USD)", config.umbralMonto, { min: 0, max: 10000000, paso: "0.01" })}
        {campo("tolerancia_inventario", "Tolerancia del cuadre de inventario (USD)", config.toleranciaInventario, { min: 0, max: 10000000, paso: "0.01" })}
        {campo("tolerancia_dropi", "Tolerancia del cuadre con Dropi (USD)", config.toleranciaDropi, { min: 0, max: 10000000, paso: "0.01" })}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Nombre de Dropi en la cartera por cobrar</span>
          <input name="contraparte_dropi" defaultValue={config.contraparteDropi} maxLength={40} required placeholder="Ej: dropi" className={fieldClass} />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      {editable && (
        <span>
          <button type="submit" disabled={enviando} aria-busy={enviando} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
            {enviando ? "Guardando..." : "Guardar ajustes"}
          </button>
        </span>
      )}
    </form>
  );
}
