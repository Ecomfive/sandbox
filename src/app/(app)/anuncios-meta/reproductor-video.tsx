"use client";

/* eslint-disable @next/next/no-img-element -- miniatura del video, directo de Meta */
import { useCallback, useEffect, useRef, useState } from "react";
import { formatoDuracion } from "@/lib/meta-ads/duracion";
import { reproducirVideoMeta } from "./actions";

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

/** El triángulo de reproducir, dentro de un círculo. */
export function BotonPlay({ grande = false }: { grande?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/30 backdrop-blur-sm transition-transform group-hover:scale-105 ${grande ? "h-16 w-16" : "h-11 w-11"}`}>
      <svg viewBox="0 0 24 24" className={grande ? "h-7 w-7" : "h-5 w-5"} fill="currentColor">
        <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
      </svg>
    </span>
  );
}

type Estado = { tipo: "quieto" } | { tipo: "cargando" } | { tipo: "listo"; url: string } | { tipo: "fallo"; mensaje: string; enlace?: string };

/**
 * El video de la ficha: la miniatura con su botón de reproducir; al pulsarlo se le pide a Meta la dirección temporal del archivo (`reproducirVideoMeta`) y se reproduce aquí mismo. Si Meta no la da, dice por
 * qué y, si hay, ofrece la vista previa del anuncio en Meta. La dirección vence a las pocas horas: si el video falla, se vuelve a pedir.
 */
export function ReproductorVideo({ videoId, miniatura, duracion, titulo, autoReproducir = false }: { videoId: string; miniatura: string | null; duracion: number | null; titulo: string; autoReproducir?: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "quieto" });
  const [segundos, setSegundos] = useState<number | null>(duracion);
  const pedido = useRef(0);
  const poster = urlSegura(miniatura);

  const pedir = useCallback(async () => {
    const mio = ++pedido.current;
    setEstado({ tipo: "cargando" });
    const r = await reproducirVideoMeta(videoId);
    if (mio !== pedido.current) return;
    if (r.url) {
      if (typeof r.duracion === "number") setSegundos(r.duracion);
      setEstado({ tipo: "listo", url: r.url });
    } else setEstado({ tipo: "fallo", mensaje: r.error ?? "No se pudo abrir el video.", enlace: r.enlace });
  }, [videoId]);

  // Con «Reproducir» desde la tarjeta, la ficha abre y el video arranca solo (una vez por video).
  const yaArranco = useRef<string | null>(null);
  useEffect(() => {
    if (!autoReproducir || yaArranco.current === videoId) return;
    yaArranco.current = videoId;
    void pedir();
  }, [autoReproducir, videoId, pedir]);

  const largo = formatoDuracion(segundos);
  if (estado.tipo === "listo") {
    return (
      <div className="flex flex-col gap-2">
        <video
          key={estado.url}
          src={estado.url}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
          preload="auto"
          aria-label={`Video: ${titulo}`}
          onError={() => setEstado({ tipo: "fallo", mensaje: "Meta cerró el enlace del video o no se pudo reproducir. Se puede volver a pedir." })}
          className="mx-auto max-h-[70vh] w-full rounded-xl bg-black object-contain"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pedir}
        disabled={estado.tipo === "cargando"}
        aria-label={`Reproducir el video ${titulo}`}
        className="group relative mx-auto block aspect-[9/16] max-h-[60vh] w-auto max-w-full cursor-pointer overflow-hidden rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-progress"
      >
        {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute inset-0 bg-black/20" aria-hidden="true" />
        <span className="absolute inset-0 flex items-center justify-center">
          {estado.tipo === "cargando" ? (
            <span className="flex flex-col items-center gap-2 text-white" role="status">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-9 w-9 animate-spin motion-reduce:animate-none" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium">Pidiéndolo a Meta…</span>
            </span>
          ) : (
            <BotonPlay grande />
          )}
        </span>
        {largo && <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{largo}</span>}
      </button>
      {estado.tipo === "fallo" && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="m-0">{estado.mensaje}</p>
          <div className="flex flex-wrap gap-2">
            {estado.enlace && (
              <a href={estado.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90">
                Ver el anuncio en Meta<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            )}
            <button type="button" onClick={pedir} className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
              Volver a intentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
