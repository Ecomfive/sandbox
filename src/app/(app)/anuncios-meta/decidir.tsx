"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { GuiaDeTope } from "@/lib/meta-ads/limite";
import { DIAS_DE_DECISION } from "@/lib/meta-ads/sugerencias";
import { decidirSugerenciaMeta, quitarDecisionMeta } from "./actions";

type Decision = "aceptada" | "rechazada" | "pospuesta";

interface Decisiones {
  /** Las llaves con una decisión vigente. */
  ocultas: ReadonlySet<string>;
  escribe: boolean;
  /** Los productos con el tope más bajo (por la llave de su nombre). */
  guias: Readonly<Record<string, GuiaDeTope>>;
}

const Contexto = createContext<Decisiones>({ ocultas: new Set(), escribe: false, guias: {} });

const SIN_GUIAS: Record<string, GuiaDeTope> = {};

/** Lo decidido sobre las sugerencias, quién puede decidir y los productos con el tope más bajo, para todas las tarjetas de una pantalla de Anuncios Meta. */
export function ProveedorDecisiones({ ocultas, escribe, guias = SIN_GUIAS, children }: { ocultas: string[]; escribe: boolean; guias?: Record<string, GuiaDeTope>; children: ReactNode }) {
  const valor = useMemo(() => ({ ocultas: new Set(ocultas), escribe, guias }), [ocultas, escribe, guias]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useDecisiones = () => useContext(Contexto);

/** Motivos de un toque para «No aplica». */
const MOTIVOS = ["Va dentro del límite", "Tocarla reiniciaría el aprendizaje", "Ya se está probando otra cosa"];

const AVISOS: Record<Decision, string> = {
  aceptada: `Anotado: no se vuelve a sugerir por ${DIAS_DE_DECISION.aceptada} días.`,
  pospuesta: `Queda para dentro de ${DIAS_DE_DECISION.pospuesta} días.`,
  rechazada: `Anotado: no se vuelve a sugerir por ${DIAS_DE_DECISION.rechazada} días.`,
};

const boton = "min-h-8 cursor-pointer rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-default disabled:opacity-50";

/**
 * «Ya lo hice», «Dejar para después» y «No aplica» (25 nov 2026, pedido de Alcides: poder omitir cualquier sugerencia, en todas las pantallas donde sale). Lo decidido se recuerda hasta que vence y se oculta en todas partes; no
 * cambia nada en Meta. Quien solo mira no ve los botones. `titulo` distingue unos botones de otros para lectores de pantalla.
 */
export function BotonesDecidir({ clave, titulo, className = "" }: { clave: string; titulo: string; className?: string }) {
  const { escribe } = useDecisiones();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupada, empezar] = useTransition();
  const [rechazando, setRechazando] = useState(false);
  const [porque, setPorque] = useState("");
  if (!escribe) return null;
  const decidir = (estado: Decision, nota?: string) =>
    empezar(async () => {
      const r = await decidirSugerenciaMeta(clave, estado, nota);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(AVISOS[estado]);
        setRechazando(false);
        router.refresh();
      }
    });
  if (rechazando)
    return (
      <form
        className={`flex w-full flex-col gap-2 ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (porque.trim().length >= 3) decidir("rechazada", porque);
        }}
      >
        <div role="group" aria-label="Motivos frecuentes" className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" disabled={ocupada} onClick={() => decidir("rechazada", m)} className={`${boton} rounded-full`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className={labelClassSm}>Otro motivo (se recuerda {DIAS_DE_DECISION.rechazada} días)</span>
            <input className={fieldClassSm} value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={300} placeholder="Ej: es una prueba corta" autoFocus />
          </label>
          <button type="submit" disabled={ocupada || porque.trim().length < 3} className="min-h-8 cursor-pointer rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:cursor-default disabled:opacity-50">
            Guardar
          </button>
          <button type="button" onClick={() => setRechazando(false)} className={boton}>
            Cancelar
          </button>
        </div>
      </form>
    );
  return (
    <div role="group" aria-label={`Qué hacer con «${titulo}»`} className={`flex flex-wrap gap-1.5 ${className}`}>
      <button type="button" disabled={ocupada} onClick={() => decidir("aceptada")} className={boton}>
        Ya lo hice
      </button>
      <button type="button" disabled={ocupada} onClick={() => decidir("pospuesta")} className={boton}>
        Dejar para después
      </button>
      <button type="button" disabled={ocupada} onClick={() => setRechazando(true)} className={`${boton} text-muted-foreground`}>
        No aplica
      </button>
    </div>
  );
}

/** Lo que alguien ya decidió en una lista: plegado, con la opción de volver a mostrarlo. */
export function Omitidas({ items }: { items: { clave: string; titulo: string }[] }) {
  const { escribe } = useDecisiones();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupada, empezar] = useTransition();
  if (items.length === 0) return null;
  const volver = (clave: string) =>
    empezar(async () => {
      const r = await quitarDecisionMeta(clave);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Vuelve a mostrarse.");
        router.refresh();
      }
    });
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="min-h-8 cursor-pointer content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
        {items.length === 1 ? "1 omitida" : `${items.length} omitidas`} (ya hechas, para después o que no aplican)
      </summary>
      <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
        {items.map((x) => (
          <li key={x.clave} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 basis-48 break-words">{x.titulo}</span>
            {escribe && (
              <button type="button" disabled={ocupada} onClick={() => volver(x.clave)} className={`${boton} text-foreground`}>
                Volver a mostrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
