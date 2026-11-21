"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { analizarVideoAhoraMeta } from "./actions";

/** Cómo le pide el resumen a la lista de Videos que abra la ficha de un video (la lista escucha este evento). */
export const EVENTO_ABRIR_VIDEO = "anuncios-meta:abrir-video";

export interface VideoParaRevisar {
  id: string;
  nombre: string;
  estado: string;
  color: string;
  motivo: string | null;
}

/**
 * Los videos que la IA no pudo ver completos (solo con el texto o con error), con su motivo. Cada uno abre **su** ficha (sin recargar la página) y, para quien puede escribir, trae su propio «Reintentar»: analiza solo ese video,
 * sin tocar los demás pendientes (20 nov 2026).
 */
export function ParaRevisar({ videos, total, puedeReintentar }: { videos: VideoParaRevisar[]; total: number; puedeReintentar: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [reintentando, setReintentando] = useState<string | null>(null);
  const reintentar = async (id: string) => {
    setReintentando(id);
    try {
      const r = await analizarVideoAhoraMeta(id);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.mensaje ?? "Listo.");
        router.refresh();
      }
    } catch {
      mostrarToast("No se pudo analizar el video: inténtalo de nuevo.", "destructive");
    } finally {
      setReintentando(null);
    }
  };
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
      <p className="m-0 text-xs font-medium text-muted-foreground">Para revisar ({total})</p>
      <ul role="list" className="m-0 flex list-none flex-col gap-3 p-0 text-xs">
        {videos.map((v) => (
          <li key={v.id} className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} />
              <span className="truncate font-medium">{v.nombre}</span>
              <span className="shrink-0 text-muted-foreground">· {v.estado}</span>
            </span>
            <span className="pl-4 text-muted-foreground">{v.motivo ?? "Sin detalle del motivo."}</span>
            <span className="flex flex-wrap gap-2 pl-4">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_VIDEO, { detail: v.id }))}
                className="min-h-8 rounded-md border border-border-control px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Abrir este video
              </button>
              {puedeReintentar && (
                <button
                  type="button"
                  disabled={reintentando !== null}
                  onClick={() => reintentar(v.id)}
                  className="min-h-8 rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                >
                  {reintentando === v.id ? "Reintentando…" : "Reintentar este video"}
                </button>
              )}
            </span>
            {reintentando === v.id && <ProgresoEstimado compacta etiqueta="Analizando el video con la IA" estimadoMs={60_000} pasos={["Bajando el video de Meta", "La IA está viendo y escuchando el video", "Guardando el análisis"]} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
