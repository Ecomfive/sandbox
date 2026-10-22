"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { CLAVES_INDICACION, ETIQUETA_INDICACION, type ClaveIndicacion, type Indicaciones } from "@/lib/publicaciones/ia/criterios";
import { guardarIndicacionesIA } from "../ia-indicaciones-actions";

const EJEMPLO: Record<ClaveIndicacion, string> = {
  general: "Ej: habla de «tú», sin promesas médicas, no menciones marcas.",
  titulo: "Ej: empieza por el producto, luego la cantidad, luego para qué sirve.",
  descripcion: "Ej: usa listas con guiones, cierra con el modo de uso.",
  fotos: "Ej: fondo claro, siempre una foto con el producto en la mano.",
  analisis: "Ej: prioriza lo que más mueve las ventas, no lo más fácil.",
};

/**
 * Lo que el equipo le dice a la IA del asistente de Gestión de IDs Dropi, por parte: se agrega a cada pedido, así la IA se ajusta al estilo
 * de Ecomfive y se va mejorando con lo que el equipo escribe. Con permiso de escritura se cambia y se guarda («Guardar indicaciones»
 * solo con cambios).
 */
export function IndicacionesIA({ indicaciones, disponible, puedeEscribir }: { indicaciones: Indicaciones; disponible: boolean; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(CLAVES_INDICACION.map((c) => [c, indicaciones[c] ?? ""])));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const sinGuardar = CLAVES_INDICACION.some((c) => (valores[c] ?? "").trim() !== (indicaciones[c] ?? "").trim());
  const editable = puedeEscribir && disponible;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await guardarIndicacionesIA(valores).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) return setError(r.error);
      mostrarToast("Indicaciones guardadas");
      router.refresh();
    });
  }

  return (
    <form onSubmit={guardar} aria-busy={guardando} className="flex max-w-3xl flex-col gap-4">
      <section aria-labelledby="indicaciones-ia" className="rounded-xl border border-border bg-card">
        <h2 id="indicaciones-ia" className="m-0 flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5 text-sm font-semibold">
          <SugerenciaIcon aria-hidden="true" className="h-4 w-4 text-primario" />
          Indicaciones para la IA
        </h2>
        {!disponible && (
          <p role="alert" className="m-0 border-b border-border px-4 py-3 text-sm text-destructive">
            Para guardarlas falta correr en Supabase la migración 0134.
          </p>
        )}
        <fieldset disabled={!editable} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-0">
          {CLAVES_INDICACION.map((c) => (
            <label key={c} className="flex flex-col gap-1.5 px-4 py-3">
              <span className="text-sm font-medium">{ETIQUETA_INDICACION[c]}</span>
              <textarea
                rows={c === "general" ? 3 : 2}
                maxLength={1500}
                value={valores[c] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
                placeholder={EJEMPLO[c]}
                className={`${fieldClass} w-full resize-y`}
              />
            </label>
          ))}
        </fieldset>
      </section>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      {editable && sinGuardar && (
        <div className="flex gap-2">
          <button type="submit" disabled={guardando} className={`inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
            <CheckIcon className="h-4 w-4" />
            {guardando ? "Guardando..." : "Guardar indicaciones"}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => setValores(Object.fromEntries(CLAVES_INDICACION.map((c) => [c, indicaciones[c] ?? ""])))}
            className={`inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
          >
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}
