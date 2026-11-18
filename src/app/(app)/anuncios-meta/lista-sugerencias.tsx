"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { DIAS_DE_DECISION, UMBRALES, type Sugerencia } from "@/lib/meta-ads/sugerencias";
import { decidirSugerenciaMeta } from "./actions";

const TEXTO_SEVERIDAD = { alta: "Urgente", media: "Importante", info: "Para mirar" } as const;

function Tarjeta({ s, escribe, ocupada, alDecidir }: { s: Sugerencia; escribe: boolean; ocupada: boolean; alDecidir: (clave: string, estado: "aceptada" | "rechazada" | "pospuesta", nota?: string) => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [porque, setPorque] = useState("");
  const punto = s.positiva ? "bg-success" : s.severidad === "alta" ? "bg-destructive" : s.severidad === "media" ? "bg-warning" : "bg-muted-foreground";
  const enlace = s.objeto.tipo === "campana" ? `/anuncios-meta/campanas?abrir=${s.objeto.id}` : s.objeto.tipo === "video" ? "/anuncios-meta/videos" : null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${punto}`} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium">
            {enlace ? (
              <Link href={enlace} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                {s.titulo}
              </Link>
            ) : (
              s.titulo
            )}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{s.detalle}</p>
          <p className="m-0 mt-1 text-xs">
            <span className="font-medium">Qué hacer: </span>
            {s.accion}
          </p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{s.positiva ? "Buena noticia" : TEXTO_SEVERIDAD[s.severidad]}</p>
        </div>
        {escribe && !rechazando && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <button type="button" disabled={ocupada} onClick={() => alDecidir(s.clave, "aceptada")} className="min-h-8 rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50">
              Ya lo hice
            </button>
            <button type="button" disabled={ocupada} onClick={() => alDecidir(s.clave, "pospuesta")} className="min-h-8 rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50">
              Dejar para después
            </button>
            <button type="button" disabled={ocupada} onClick={() => setRechazando(true)} className="min-h-8 rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50">
              No aplica
            </button>
          </div>
        )}
      </div>
      {escribe && rechazando && (
        <form
          className="ml-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            alDecidir(s.clave, "rechazada", porque);
          }}
        >
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className={labelClassSm}>¿Por qué no aplica? (se recuerda {DIAS_DE_DECISION.rechazada} días)</span>
            <input className={fieldClassSm} value={porque} onChange={(e) => setPorque(e.target.value)} maxLength={300} placeholder="Ej: es una prueba corta, todavía no se decide" autoFocus />
          </label>
          <button type="submit" disabled={ocupada || porque.trim().length < 3} className="min-h-8 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50">
            Guardar
          </button>
          <button type="button" onClick={() => setRechazando(false)} className="min-h-8 rounded-md border border-border-control px-3 py-1 text-xs font-medium hover:bg-muted">
            Cancelar
          </button>
        </form>
      )}
    </li>
  );
}

/** «Para decidir hoy»: lo que el sistema ve en los números y propone hacer. Aceptar, dejar para después o rechazar (con porqué) se recuerda hasta que vence. No cambia nada en Meta. */
export function ListaSugerencias({ sugerencias, decididas, escribe }: { sugerencias: Sugerencia[]; decididas: number; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupada, empezar] = useTransition();
  const [todas, setTodas] = useState(false);
  const visibles = todas ? sugerencias : sugerencias.slice(0, 6);
  const decidir = (clave: string, estado: "aceptada" | "rechazada" | "pospuesta", nota?: string) =>
    empezar(async () => {
      const r = await decidirSugerenciaMeta(clave, estado, nota);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(estado === "aceptada" ? "Anotado: no se vuelve a sugerir por 30 días." : estado === "pospuesta" ? "Queda para dentro de 7 días." : "Anotado: no se vuelve a sugerir por 90 días.");
        router.refresh();
      }
    });
  return (
    <section aria-labelledby="para-decidir" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground">
        <h2 id="para-decidir" className="m-0 text-xs font-medium">
          Para decidir hoy
        </h2>
        <span>{sugerencias.length === 0 ? "Nada pendiente" : `${sugerencias.length} ${sugerencias.length === 1 ? "sugerencia" : "sugerencias"}`}</span>
      </div>
      {sugerencias.length === 0 ? (
        <p className="m-0 px-4 py-6 text-sm text-muted-foreground">
          No hay nada que decidir con los números de los últimos 7 días.{decididas > 0 ? ` Hay ${decididas} ya decididas que no se repiten hasta que venzan.` : ""}
        </p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {visibles.map((s) => (
            <Tarjeta key={s.clave} s={s} escribe={escribe} ocupada={ocupada} alDecidir={decidir} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          Las sugerencias solo avisan: no cambian nada en Meta. Se calculan con los últimos 7 días y esto: sin compras tras {UMBRALES.sinComprasVeces} veces el CPA tope, CPA más de {Math.round((UMBRALES.cpaAltoFactor - 1) * 100)} % sobre el tope, escalar con {UMBRALES.escalarCompras}+ compras.
        </span>
        {sugerencias.length > 6 && (
          <button type="button" onClick={() => setTodas((v) => !v)} className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            {todas ? "Ver menos" : `Ver las ${sugerencias.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
