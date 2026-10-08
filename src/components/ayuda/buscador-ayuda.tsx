"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { buscarEnIndice, ETIQUETA_TIPO, extracto, type EntradaIndice } from "@/lib/ayuda/indice";
import { BuscarIcon } from "@/lib/nav-icons";

/**
 * El buscador de la ayuda (como «How can we help?» de ClickUp, pero al instante): busca en el glosario, las guías y cada
 * paso, los cursos y sus lecciones y los manuales que la persona puede ver. Flechas y Enter para elegir; los temas rápidos
 * escriben la búsqueda. `grande` es el del inicio del Centro de ayuda; sin él, el del panel de la barra negra.
 */
export function BuscadorAyuda({ indice, grande = false, temas = [], autoFocus = false }: { indice: EntradaIndice[]; grande?: boolean; temas?: string[]; autoFocus?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [consulta, setConsulta] = useState("");
  const [activa, setActiva] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscarEnIndice(indice, consulta, grande ? 10 : 7), [indice, consulta, grande]);

  useEffect(() => {
    if (autoFocus) campo.current?.focus();
  }, [autoFocus]);

  function ir(e: EntradaIndice) {
    router.push(e.href);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <BuscarIcon aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${grande ? "left-4 h-5 w-5" : "left-2.5 h-4 w-4"}`} />
        <input
          ref={campo}
          type="search"
          role="combobox"
          aria-expanded={resultados.length > 0}
          aria-controls={`${id}-resultados`}
          aria-activedescendant={resultados.length ? `${id}-r${activa}` : undefined}
          aria-label="Buscar en la ayuda"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setActiva(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = resultados.length;
              if (n) setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter" && resultados[activa]) {
              e.preventDefault();
              ir(resultados[activa]);
            }
          }}
          placeholder={grande ? "Busca un término, un módulo o cómo hacer algo…" : "Buscar en la ayuda…"}
          className={`w-full border border-border-control bg-card outline-none focus:border-primario focus:ring-2 focus:ring-primario/30 ${
            grande ? "rounded-xl py-3.5 pr-4 pl-12 text-base shadow-[0_8px_30px_-12px_rgb(95_67_209/0.45)]" : "rounded-lg py-1.5 pr-2 pl-8 text-sm"
          }`}
        />
      </div>
      {temas.length > 0 && !consulta && (
        <div className="flex flex-wrap gap-1.5">
          {temas.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setConsulta(t);
                campo.current?.focus();
              }}
              className={`rounded-full border border-white/40 bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur hover:bg-white/25 ${anilloFoco}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {consulta.trim().length > 1 && (
        <ul id={`${id}-resultados`} role="listbox" aria-label="Resultados de la ayuda" className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-border bg-card p-1 text-left text-foreground shadow-lg">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Nada coincide con «{consulta}». Prueba con otra palabra.</li>
          ) : (
            resultados.map((r, i) => (
              <li
                key={`${r.href}-${r.titulo}`}
                id={`${id}-r${i}`}
                role="option"
                aria-selected={i === activa}
                onMouseEnter={() => setActiva(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ir(r)}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 ${i === activa ? "bg-primario-suave" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{ETIQUETA_TIPO[r.tipo]}</span>
                  <span className="truncate">{r.titulo}</span>
                </span>
                {grande && <span className="truncate text-xs text-muted-foreground">{extracto(r.texto, consulta)}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
