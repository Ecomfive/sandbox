"use client";

import Link from "next/link";
import { useState } from "react";
import { Ventana } from "@/components/ui/ventana";
import { dolares } from "@/lib/meta-ads/metricas";
import type { VideoEjemplo } from "@/lib/meta-ads/video-ejemplo";
import { ReproductorVideo } from "./reproductor-video";

/**
 * El video de ejemplo de una recomendación (27 nov 2026, pedido de Hernán): cuando el sistema dice «sube videos con el ángulo X», un enlace al video de ese producto con ese ángulo que mejor funcionó. Al pulsarlo se
 * abre ahí mismo, en una ventana, y se reproduce; desde la ventana se puede ir a su ficha en Videos.
 */
export function VerVideoEjemplo({ video, className = "" }: { video: VideoEjemplo | null | undefined; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!video) return null;
  const cifra = video.cpa !== null ? `CPA ${dolares(video.cpa)} con ${video.compras} ${video.compras === 1 ? "compra" : "compras"} en ${video.dias} días` : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className={`inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-md text-left text-xs font-medium text-primario underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${className}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" className="shrink-0" fill="currentColor">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
        </svg>
        <span className="min-w-0">
          Ver el video de ejemplo: <span className="break-words">«{video.nombre}»</span>
          {cifra && <span className="font-normal text-muted-foreground"> · {cifra}</span>}
        </span>
      </button>
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo={<span className="min-w-0 break-words text-base font-semibold">{video.nombre}</span>} ancho="lg">
        {abierto && (
          <div className="flex flex-col gap-3 px-5 py-5">
            <p className="m-0 text-sm text-muted-foreground">
              {video.angulo ? <>Ángulo «{video.angulo}». </> : null}
              {cifra ? `${cifra[0].toUpperCase()}${cifra.slice(1)}.` : "Todavía sin compras."}
            </p>
            <div className="mx-auto w-full max-w-sm">
              <ReproductorVideo videoId={video.id} miniatura={video.miniatura} duracion={null} titulo={video.nombre} autoReproducir />
            </div>
            <Link href={`/anuncios-meta/videos?abrir=${encodeURIComponent(video.id)}`} className="w-fit text-xs font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              Ver su ficha en Videos
            </Link>
          </div>
        )}
      </Ventana>
    </>
  );
}
