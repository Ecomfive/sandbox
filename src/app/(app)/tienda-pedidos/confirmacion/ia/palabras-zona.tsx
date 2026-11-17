"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon, UbicacionIcon } from "@/lib/nav-icons";
import { SeccionCard } from "./seccion";
import { NOMBRE_ZONA, type Zona } from "@/lib/confirmacion-ia/zonas";
import { agregarPalabraZona, eliminarPalabraZona, listarPalabrasZona, type PalabraZona } from "../ia-actions";

const ZONA_TEXTO = NOMBRE_ZONA;

function Grupo({ titulo, ayuda, palabras, puedeEscribir, alQuitar }: { titulo: string; ayuda: string; palabras: PalabraZona[]; puedeEscribir: boolean; alQuitar: (p: PalabraZona) => void }) {
  return (
    <details className="rounded-lg border border-border">
      <summary className={`flex cursor-pointer flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${anilloFoco}`}>
        <span>
          {titulo} <span className="font-normal text-muted-foreground">({palabras.length})</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">{ayuda}</span>
      </summary>
      <div className="border-t border-border p-3">
        {palabras.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay ninguna.</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {palabras.map((p) => (
              <li key={p.id} className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-3 text-sm ${p.resultado === "ciudad" ? "border-success/40 bg-success-soft" : "border-warning/40 bg-warning-soft"}`}>
                <span>
                  {p.texto} <span className="text-xs text-muted-foreground">· {ZONA_TEXTO[p.resultado]}</span>
                </span>
                {puedeEscribir && (
                  <button type="button" aria-label={`Quitar ${p.texto}`} onClick={() => alQuitar(p)} className={`grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-card ${anilloFoco}`}>
                    <CerrarIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function PalabrasZona({ paisNombre, distingueZona, puedeEscribir, inicial }: { paisNombre: string; distingueZona: boolean; puedeEscribir: boolean; inicial: PalabraZona[] }) {
  const { mostrarToast } = useToast();
  const [palabras, setPalabras] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<Zona>("interior");
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<PalabraZona | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!distingueZona)
    return (
      <SeccionCard id="zonas" icono={UbicacionIcon} titulo="Palabras de zona" derecha={<span className="text-xs text-muted-foreground">{paisNombre}</span>}>
        <p className="m-0 text-sm text-muted-foreground">En {paisNombre} todavía no se distingue entre ciudad e interior, así que no se usan palabras de zona. Cuando se confirme cómo se envía, se activan aquí.</p>
      </SeccionCard>
    );

  const sueltas = palabras.filter((p) => !p.compuesta);
  const juntas = palabras.filter((p) => p.compuesta);
  return (
    <SeccionCard
      id="zonas"
      icono={UbicacionIcon}
      titulo="Palabras de zona"
      derecha={
        <span className="text-xs text-muted-foreground">
          {paisNombre} · {palabras.length} {palabras.length === 1 ? "guardada" : "guardadas"}
        </span>
      }
      ayuda="Si una de estas palabras sale en la dirección, la IA toma esa zona. Una palabra sola (Colón) o varias juntas (Panamá Este); las juntas pesan más."
    >
      <div className="flex flex-col gap-4">
        {puedeEscribir ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              empezar(async () => {
                const r = await agregarPalabraZona(texto, resultado);
                if (r.error) return setError(r.error);
                const lista = await listarPalabrasZona();
                if (!lista.error) setPalabras(lista.palabras);
                setTexto("");
                mostrarToast("Palabra guardada.");
              });
            }}
          >
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className={labelClass}>Palabra o palabras</span>
              <input value={texto} maxLength={80} required onChange={(e) => setTexto(e.target.value)} placeholder="Ej: Colón, o Panamá Este" className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Entonces es de</span>
              <select value={resultado} onChange={(e) => setResultado(e.target.value as Zona)} className={fieldClass}>
                <option value="interior">{NOMBRE_ZONA.interior}</option>
                <option value="ciudad">{NOMBRE_ZONA.ciudad}</option>
              </select>
            </label>
            <button type="submit" disabled={pendiente || texto.trim().length < 2} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Agregar"}
            </button>
          </form>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Solo lectura: tu rol no puede agregar palabras.</p>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>

      <Grupo titulo="Una palabra" ayuda="Ej: Colón" palabras={sueltas} puedeEscribir={puedeEscribir} alQuitar={setQuitando} />
      <Grupo titulo="Varias palabras juntas" ayuda="Ej: Panamá Este" palabras={juntas} puedeEscribir={puedeEscribir} alQuitar={setQuitando} />

      {quitando && (
        <div role="alertdialog" aria-label="Quitar palabra" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5">
          <span className="text-sm">
            ¿Quitar <b>{quitando.texto}</b>?
          </span>
          <button type="button" className={`rounded-md border border-border-control bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted ${anilloFoco}`} onClick={() => setQuitando(null)}>
            No
          </button>
          <button
            type="button"
            disabled={pendiente}
            className={`rounded-md bg-destructive px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${anilloFoco}`}
            onClick={() =>
              empezar(async () => {
                const r = await eliminarPalabraZona(quitando.id);
                if (r.error) return mostrarToast(r.error, "destructive");
                setPalabras((xs) => xs.filter((x) => x.id !== quitando.id));
                setQuitando(null);
              })
            }
          >
            Sí, quitar
          </button>
        </div>
      )}
    </SeccionCard>
  );
}
