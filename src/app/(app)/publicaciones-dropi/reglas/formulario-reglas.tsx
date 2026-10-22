"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, ReiniciarIcon } from "@/lib/nav-icons";
import { REGLAS, REGLAS_DEFECTO, mostrarRegla, valorEnCampo, type DefRegla, type Reglas } from "@/lib/publicaciones/reglas";
import { guardarReglas } from "../recomendaciones-actions";

const GRUPOS: { id: DefRegla["grupo"]; titulo: string }[] = [
  { id: "margen", titulo: "Margen" },
  { id: "ventas", titulo: "Ventas" },
  { id: "combo", titulo: "Combo x2" },
  { id: "tareas", titulo: "Tareas" },
];
const SUFIJO: Record<DefRegla["unidad"], string> = { porcentaje: "%", unidades: "unidades", dias: "días" };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" });

const valoresDe = (r: Reglas) => Object.fromEntries(REGLAS.map((d) => [d.clave, valorEnCampo(d, r[d.clave])])) as Record<string, string>;

/**
 * Los umbrales de Gestión de IDs Dropi en tres bloques. Con permiso de escritura se cambian y se guardan juntos («Guardar reglas»
 * solo con cambios); queda quién cambió cada uno y cuándo. «Valores de siempre» los devuelve a los del sistema (hay que guardar).
 */
export function FormularioReglas({ reglas, cambios, disponible, puedeEscribir }: { reglas: Reglas; cambios: Record<string, { en: string; por: string | null }>; disponible: boolean; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [valores, setValores] = useState(() => valoresDe(reglas));
  const [estado, accion, guardando] = useActionState(guardarReglas, null);
  const visto = useRef(estado);
  const inicial = valoresDe(reglas);
  const sinGuardar = REGLAS.some((d) => valores[d.clave] !== inicial[d.clave]);
  const editable = puedeEscribir && disponible;

  useEffect(() => {
    if (estado === visto.current) return;
    visto.current = estado;
    if (estado?.ok) {
      mostrarToast("Reglas guardadas");
      router.refresh();
    }
  }, [estado, mostrarToast, router]);

  return (
    <form action={accion} className="flex max-w-3xl flex-col gap-6">
      {!disponible && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Se usan los valores de siempre. Para cambiarlos falta correr en Supabase la migración 0127.
        </p>
      )}
      <fieldset disabled={!editable} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
        {GRUPOS.map((g) => (
          <section key={g.id} aria-labelledby={`regla-${g.id}`} className="rounded-xl border border-border bg-card">
            <h2 id={`regla-${g.id}`} className="m-0 border-b border-border bg-muted px-4 py-2.5 text-sm font-semibold">
              {g.titulo}
            </h2>
            <ul className="m-0 list-none divide-y divide-border p-0">
              {REGLAS.filter((d) => d.grupo === g.id).map((d) => {
                const c = cambios[d.clave];
                const distinto = Math.abs(reglas[d.clave] - d.defecto) > 1e-9;
                return (
                  <li key={d.clave} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-6">
                    <label htmlFor={`regla-${d.clave}`} className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{d.etiqueta}</span>
                      <span className="text-xs text-muted-foreground">{d.descripcion}</span>
                      {(c || distinto) && (
                        <span className="text-xs text-muted-foreground">
                          {distinto && `De siempre: ${mostrarRegla(d, d.defecto)}`}
                          {distinto && c && " · "}
                          {c && `Cambiada ${c.por ? `por ${c.por} ` : ""}el ${fecha(c.en)}`}
                        </span>
                      )}
                    </label>
                    <span className="flex items-center gap-2">
                      <input
                        id={`regla-${d.clave}`}
                        name={d.clave}
                        inputMode="decimal"
                        required
                        value={valores[d.clave]}
                        onChange={(e) => setValores((v) => ({ ...v, [d.clave]: e.target.value }))}
                        className={`${fieldClass} w-24 text-right tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">{SUFIJO[d.unidad]}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </fieldset>

      {estado?.error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {estado.error}
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!sinGuardar || guardando}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
          >
            <CheckIcon className="h-4 w-4" />
            {guardando ? "Guardando..." : "Guardar reglas"}
          </button>
          {sinGuardar && (
            <button type="button" disabled={guardando} onClick={() => setValores(inicial)} className={`inline-flex h-10 items-center rounded-md border border-border-control bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            disabled={guardando}
            onClick={() => setValores(valoresDe(REGLAS_DEFECTO))}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md border border-border-control bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}
          >
            <ReiniciarIcon className="h-4 w-4" />
            Valores de siempre
          </button>
        </div>
      )}
    </form>
  );
}
