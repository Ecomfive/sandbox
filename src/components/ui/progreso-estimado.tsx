"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/lib/nav-icons";
import { fraccionEstimada, pasoActual } from "@/lib/progreso-estimado";

function Girando({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 animate-spin motion-reduce:animate-none ${className ?? ""}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * El avance de un proceso que se espera sin saber cuánto va a tardar (leer una página pública, guardar una lectura de la Biblioteca): una
 * barra que arranca de golpe y frena sin llegar al final, los pasos de lo que se está haciendo que cambian seguido (así no parece quieto) y los
 * segundos que lleva. Se monta **solo mientras se espera**, así los segundos arrancan en cero; `terminado` la deja en 100 % con todos los pasos
 * hechos y quien la usa la quita unos instantes después. Sin animación, si la persona pidió menos movimiento (la barra igual avanza, sin brillo
 * ni giro). `compacta` deja solo el paso y la barra, para un proceso corto dentro de una ficha o una barra de botones.
 */
export function ProgresoEstimado({ pasos, estimadoMs, terminado = false, compacta = false, etiqueta }: { pasos: string[]; estimadoMs: number; terminado?: boolean; compacta?: boolean; etiqueta: string }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (terminado) return;
    const inicio = Date.now();
    const cada = setInterval(() => setMs(Date.now() - inicio), 100);
    return () => clearInterval(cada);
  }, [terminado]);

  const fraccion = terminado ? 1 : fraccionEstimada(ms, estimadoMs);
  const paso = terminado ? pasos.length : pasoActual(fraccion, pasos.length);
  const porcentaje = Math.round(fraccion * 100);
  const segundos = Math.floor(ms / 1000);

  return (
    <div aria-busy={!terminado} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          {terminado ? <CheckIcon className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <Girando className="h-4 w-4 text-primario" />}
          <span role="status" aria-live="polite" className="min-w-0 truncate">
            {terminado ? "Listo" : pasos[Math.min(paso, pasos.length - 1)]}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {segundos} s
        </span>
      </div>
      <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje} className="h-1.5 overflow-hidden rounded-full bg-border">
        <div data-avanzando={!terminado} style={{ width: `${porcentaje}%` }} className={`barra-progreso h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${terminado ? "bg-success" : "bg-primario"}`} />
      </div>
      {!compacta && pasos.length > 1 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
          {pasos.map((texto, i) => {
            const hecho = i < paso;
            const actual = i === paso && !terminado;
            return (
              <li key={texto} aria-current={actual ? "step" : undefined} className={`flex items-center gap-2 ${hecho || actual ? "text-foreground" : "text-muted-foreground"}`}>
                {hecho ? (
                  <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : actual ? (
                  <Girando className="h-3.5 w-3.5 text-primario" />
                ) : (
                  <span aria-hidden="true" className="mx-[5px] h-1 w-1 shrink-0 rounded-full bg-border-control" />
                )}
                <span>{texto}</span>
                <span className="sr-only">{hecho ? " (hecho)" : actual ? " (en curso)" : " (pendiente)"}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
