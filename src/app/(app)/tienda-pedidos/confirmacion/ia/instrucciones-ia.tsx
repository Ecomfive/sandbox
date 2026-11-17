"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SugerenciaIcon } from "@/lib/nav-icons";
import { MAX_INSTRUCCIONES } from "@/lib/confirmacion-ia/prompt";
import { guardarInstrucciones } from "../ia-actions";
import { SeccionCard } from "./seccion";

/** «Instrucciones de la IA»: solo la ven y la cambian los administradores. Se suman a las instrucciones internas con que ChatGPT y Claude analizan cada dirección. */
export function InstruccionesIA({ paisNombre, inicial }: { paisNombre: string; inicial: string }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambio = texto.trim() !== guardado.trim();

  return (
    <SeccionCard
      id="instrucciones"
      icono={SugerenciaIcon}
      titulo="Instrucciones de la IA"
      derecha={<span className="text-xs text-muted-foreground">Solo administradores · {paisNombre}</span>}
      ayuda="Reglas extra que se suman a las instrucciones internas de ChatGPT y Claude al analizar una dirección. Los asesores no ven esto: ellos solo agregan ejemplos y palabras de zona."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          empezar(async () => {
            const r = await guardarInstrucciones(texto);
            if (r.error) return setError(r.error);
            setGuardado(texto.trim());
            setTexto(texto.trim());
            mostrarToast("Instrucciones guardadas.");
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Instrucciones adicionales</span>
          <textarea
            rows={5}
            maxLength={MAX_INSTRUCCIONES}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej: Un apartamento con el nombre del edificio y el piso cuenta como completo aunque no tenga calle."
            className={fieldClass}
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {texto.length} de {MAX_INSTRUCCIONES} letras
          </span>
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={pendiente || !cambio} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Guardar instrucciones"}
          </button>
        </div>
      </form>
    </SeccionCard>
  );
}
