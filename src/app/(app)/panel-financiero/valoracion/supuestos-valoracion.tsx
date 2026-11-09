"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CAMPOS_VALORACION, type SupuestosValoracion } from "@/lib/finanzas/valoracion";
import { guardarValoracion } from "./actions";

const EJEMPLO: Record<keyof SupuestosValoracion, string> = {
  multiplo: "Ej: 4",
  tasaDescuento: "Ej: 22",
  crecimientoPerpetuo: "Ej: 3",
  anios: "Ej: 5",
  tasaImpuesto: "Ej: 25",
};

/**
 * Los supuestos de la valoración. Con permiso de modificar Estado de resultados es un formulario: «Guardar» y
 * «Descartar» aparecen solo con cambios. Sin permiso, solo se leen.
 */
export function SupuestosValoracion({ supuestos, puedeEscribir }: { supuestos: SupuestosValoracion; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const inicial = Object.fromEntries(CAMPOS_VALORACION.map((c) => [c.clave, String(supuestos[c.clave])])) as Record<keyof SupuestosValoracion, string>;
  const [valores, setValores] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const cambiado = CAMPOS_VALORACION.some((c) => valores[c.clave] !== inicial[c.clave]);

  if (!puedeEscribir) {
    return (
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
        {CAMPOS_VALORACION.map((c) => (
          <div key={c.clave} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{c.etiqueta}</dt>
            <dd className="tabular-nums">{supuestos[c.clave]}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        empezar(async () => {
          const r = await guardarValoracion(datos).catch(() => ({ error: "No se pudo guardar." }));
          if (r.error) {
            setError(r.error);
            mostrarToast(r.error, "destructive");
          } else {
            setError(null);
            mostrarToast("Supuestos guardados");
            router.refresh();
          }
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {CAMPOS_VALORACION.map((c) => (
          <label key={c.clave} className="flex flex-col gap-1">
            <span className={labelClass}>{c.etiqueta}</span>
            <input
              name={c.clave}
              type="text"
              inputMode="decimal"
              required
              value={valores[c.clave]}
              placeholder={EJEMPLO[c.clave]}
              onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })}
              className={`${fieldClass} tabular-nums`}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      {cambiado && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pendiente}
            onClick={() => {
              setValores(inicial);
              setError(null);
            }}
          >
            Descartar
          </Button>
        </div>
      )}
    </form>
  );
}
