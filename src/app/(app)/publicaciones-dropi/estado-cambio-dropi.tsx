"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { CambioDropiVista } from "@/lib/publicaciones/cambios-dropi";
import { reintentarCambioDropi } from "./conexion-actions";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/** Cómo va el último cambio de nombre en Dropi de una publicación: aplicado, pendiente (hasta conectar) o con error (y reintentar). */
export function EstadoCambioDropi({ c, puedeEscribir }: { c: CambioDropiVista; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const reintentar = () =>
    empezar(async () => {
      const r = await reintentarCambioDropi(c.id);
      mostrarToast(r.error ?? r.detalle ?? "Listo.", r.error || r.estado === "error" ? "destructive" : r.estado === "pendiente" ? "info" : undefined);
    });
  const guia = c.nombreGuia ? ` · guía «${c.nombreGuia}»` : "";
  if (c.estado === "aplicado")
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Cambiado en Dropi el {fecha(c.aplicadoEn ?? c.creadoEn)}
        {guia}
      </span>
    );
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${c.estado === "error" ? "text-destructive" : "text-warning"}`}>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${c.estado === "error" ? "bg-destructive" : "bg-warning"}`} />
        {c.estado === "error" ? `No se pudo cambiar en Dropi: ${c.error ?? "sin detalle"}` : `Pendiente en Dropi («${c.nombre}»${guia}): se aplica al conectar Dropi.`}
      </span>
      {puedeEscribir && (
        <button type="button" disabled={pendiente} onClick={reintentar} className="rounded border border-border bg-card px-1.5 py-0.5 font-medium text-foreground hover:bg-muted disabled:opacity-50">
          {pendiente ? "Intentando…" : "Reintentar"}
        </button>
      )}
    </span>
  );
}
