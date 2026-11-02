"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { borrarChat, borrarMensaje } from "../borrados/actions";

/** Qué se quiere borrar: el chat entero o un mensaje (con su texto, para que se vea cuál). */
export type QueBorrar = { tipo: "chat" } | { tipo: "mensaje"; mensajeId: string; resumen: string };

/**
 * Confirma borrar un chat o un mensaje (2 nov 2026). Se borra al instante, sin autorización: a Atención se le quita y Comercial, Dirección y los administradores lo
 * siguen viendo con la etiqueta de que se borró.
 */
export function ConfirmarBorrado({ conversacionId, nombre, que, alCerrar, alBorrar }: { conversacionId: string; nombre: string; que: QueBorrar; alCerrar: () => void; alBorrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  function borrar() {
    if (enviando) return;
    setError(null);
    empezar(async () => {
      const r = await (que.tipo === "chat" ? borrarChat(conversacionId) : borrarMensaje(conversacionId, que.mensajeId)).catch(() => ({ error: "No se pudo borrar. Inténtalo de nuevo." }));
      if ("error" in r) setError(r.error);
      else alBorrar();
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo={que.tipo === "chat" ? "Borrar el chat" : "Borrar el mensaje"} ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          borrar();
        }}
      >
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">{que.tipo === "chat" ? "Chat con" : `Mensaje en el chat con ${nombre}`}</span>
          <span className="text-sm font-medium [overflow-wrap:anywhere]">{que.tipo === "chat" ? nombre : que.resumen}</span>
        </div>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={enviando} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando} data-enfocar className={`inline-flex min-h-10 items-center rounded-lg bg-destructive px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            {enviando ? "Borrando…" : "Borrar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}
