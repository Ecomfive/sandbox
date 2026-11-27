"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FechaHora } from "@/components/ui/fecha-hora";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { EstadoAnalisisAutomatico } from "@/lib/meta-ads/ajustes";
import { cambiarAnalisisAutomaticoMeta } from "./actions";

/**
 * El interruptor del análisis automático de videos (el que corre solo cada 10 minutos): pausarlo y reanudarlo se hace aquí, a la vista, y no desde el chat (21 nov 2026, pedido de Jhokser: la cuenta de Gemini
 * quedó suspendida). Pausarlo no impide «Analizar los pendientes» ni «Reintentar este video», que son a mano.
 */
export function ControlAnalisisAutomatico({ estado }: { estado: EstadoAnalisisAutomatico }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [cambiando, setCambiando] = useState(false);
  const cambiar = async () => {
    setCambiando(true);
    try {
      const r = await cambiarAnalisisAutomaticoMeta(!estado.activo);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(estado.activo ? "Análisis automático en pausa." : "Análisis automático reanudado.");
        router.refresh();
      }
    } catch {
      mostrarToast("No se pudo cambiar: inténtalo de nuevo.", "destructive");
    } finally {
      setCambiando(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={estado.activo}
        aria-label={`Análisis automático de videos cada 10 minutos: ${estado.activo ? "activo, pulsa para pausarlo" : "en pausa, pulsa para reanudarlo"}`}
        disabled={cambiando || estado.sinTabla}
        onClick={cambiar}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${estado.activo ? "bg-success" : "bg-border-control"} ${anilloFoco}`}
      >
        <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${estado.activo ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <div className="flex min-w-0 flex-col text-xs">
        <span className="font-medium">
          Análisis automático (cada 10 min): {estado.sinTabla ? "falta la migración 0347" : estado.activo ? "activo" : "en pausa"}
        </span>
        {!estado.sinTabla && estado.en && (
          <span className="text-muted-foreground">
            {estado.activo ? "Reanudado" : "Pausado"}
            {estado.por ? ` por ${estado.por}` : ""} el <FechaHora iso={estado.en} />
          </span>
        )}
      </div>
    </div>
  );
}
