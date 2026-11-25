"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NOMBRE_METRICA, type EstadoVigilancia, type Prioridad, type ResultadoVigilancia } from "@/lib/meta-ads/analisis-pedido";
import { cambiarVigilanciaMeta } from "./actions";
import { SeccionPlegable } from "./plegable";

const ESTADO: Record<EstadoVigilancia | "pausa", { texto: string; clase: string }> = {
  alerta: { texto: "En alerta", clase: "bg-destructive-soft text-destructive" },
  bueno: { texto: "A favor", clase: "bg-success-soft text-success" },
  estable: { texto: "Sin cambios", clase: "bg-muted text-muted-foreground" },
  sin_datos: { texto: "Sin datos", clase: "bg-muted text-muted-foreground" },
  pausa: { texto: "En pausa", clase: "bg-muted text-muted-foreground" },
};
const PRIORIDAD: Record<Prioridad, { texto: string; clase: string }> = {
  alta: { texto: "Prioridad alta", clase: "bg-destructive text-white" },
  media: { texto: "Prioridad media", clase: "bg-warning-soft text-warning" },
  baja: { texto: "Prioridad baja", clase: "bg-muted text-muted-foreground" },
};

function valor(m: ResultadoVigilancia["metrica"], n: number | null): string {
  if (n === null) return "—";
  if (m === "gasto" || m === "cpa" || m === "cpm" || m === "resultado") return `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
  if (m === "compras") return String(Math.round(n));
  return `${n.toFixed(m === "hook" || m === "clic_a_visita" ? 1 : 2)} %`;
}

function Tarjeta({ v, escribe }: { v: ResultadoVigilancia; escribe: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const e = ESTADO[v.activa ? v.estado : "pausa"];
  const p = PRIORIDAD[v.prioridad];
  const cambiar = (cambio: Parameters<typeof cambiarVigilanciaMeta>[1]) =>
    empezar(async () => {
      const r = await cambiarVigilanciaMeta(v.id, cambio);
      if (r.error) setError(r.error);
      else {
        setError(null);
        setConfirmar(false);
        router.refresh();
      }
    });
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{v.titulo}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${e.clase}`}>{e.texto}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${p.clase}`}>{p.texto}</span>
              <span className="text-muted-foreground">
                {NOMBRE_METRICA[v.metrica]} · últimos {v.ventanaDias} días · {v.origen === "insistencia" ? "Por tus preguntas" : "Pedida en el chat"}
              </span>
            </span>
            {v.activa && <span className="mt-1.5 block text-sm text-muted-foreground">{v.resumen}</span>}
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {v.filas.length > 0 && (
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-xs">
              {v.filas.map((f) => (
                <li key={f.nombre} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate font-medium" title={f.nombre}>
                    {f.nombre}
                  </span>
                  <span className="flex flex-none items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      {valor(v.metrica, f.antes)} → <span className="font-semibold text-foreground">{valor(v.metrica, f.ahora)}</span>
                    </span>
                    {f.cambioPct !== null && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${f.sentido === "malo" ? "bg-destructive-soft text-destructive" : f.sentido === "bueno" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                        {f.cambioPct > 0 ? "+" : ""}
                        {Math.round(f.cambioPct)} %
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-xs text-muted-foreground">Se marca cuando algo se mueve más de {v.umbralPct} % frente a los {v.ventanaDias} días anteriores.</p>
          {escribe && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="font-medium">Prioridad</span>
                <select
                  value={v.prioridad}
                  disabled={pendiente}
                  onChange={(ev) => cambiar({ prioridad: ev.target.value })}
                  className="min-h-9 rounded-md border border-border-control bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </label>
              <button type="button" disabled={pendiente} onClick={() => cambiar({ activa: !v.activa })} className="min-h-9 rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                {v.activa ? "Pausar" : "Reanudar"}
              </button>
              {confirmar ? (
                <span className="flex items-center gap-2 text-xs">
                  ¿Quitarla?
                  <button type="button" disabled={pendiente} onClick={() => cambiar({ quitar: true })} className="min-h-9 rounded-md bg-destructive px-3 font-medium text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    Sí, quitar
                  </button>
                  <button type="button" onClick={() => setConfirmar(false)} className="min-h-9 rounded-md border border-border-control bg-card px-3 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    No
                  </button>
                </span>
              ) : (
                <button type="button" disabled={pendiente} onClick={() => setConfirmar(true)} className="min-h-9 rounded-md px-3 text-xs font-medium text-destructive hover:bg-destructive-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  Quitar
                </button>
              )}
            </div>
          )}
          {error && (
            <p className="m-0 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * «Lo que estás vigilando» (24 nov 2026, pedido de Alcides): lo que la persona le pidió al chat que le indique desde ahora (o que el sistema empezó a vigilar porque se preguntaba seguido), con su prioridad. Las que están en alerta
 * van primero. Cada tarjeta se abre para ver los grupos que se movieron y, a quien puede modificar el módulo, cambiar la prioridad, pausarla o quitarla.
 */
export function VigilanciasVista({ vigilancias, escribe }: { vigilancias: ResultadoVigilancia[]; escribe: boolean }) {
  const enAlerta = vigilancias.filter((v) => v.activa && v.estado === "alerta").length;
  return (
    <SeccionPlegable titulo="Lo que estás vigilando" resumen={vigilancias.length ? `${enAlerta} en alerta de ${vigilancias.length}` : "Nada todavía"} derecha={vigilancias.length ? `${vigilancias.length} ${vigilancias.length === 1 ? "vigilancia" : "vigilancias"}` : undefined}>
      {vigilancias.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Pídele al chat de abajo que vigile algo, por ejemplo «avísame si el CPA de un producto sube más de 20 %, prioridad alta», y aparecerá aquí.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {vigilancias.map((v) => (
            <Tarjeta key={v.id} v={v} escribe={escribe} />
          ))}
        </ul>
      )}
    </SeccionPlegable>
  );
}
