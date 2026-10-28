"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { MIN_MOTIVO, motivoLimpio, motivoValido } from "@/lib/whatsapp/borrado";
import { pedirBorrado } from "../borrados/actions";

/** Qué se quiere borrar: el chat entero o un mensaje (con su texto, para que se vea cuál). */
export type QueBorrar = { tipo: "chat" } | { tipo: "mensaje"; mensajeId: string; resumen: string };

/**
 * «Pedir borrar» un chat o un mensaje (28 oct 2026). No borra nada: se cuenta el motivo y la petición le llega a la persona por encima (su jefe en
 * Puestos; si no tiene, un administrador), que la autoriza o la rechaza. Si la autoriza, se oculta de la bandeja y un administrador lo puede recuperar.
 */
export function PedirBorrado({ conversacionId, nombre, que, alCerrar, alPedido }: { conversacionId: string; nombre: string; que: QueBorrar; alCerrar: () => void; alPedido: (autorizan: string[]) => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();
  const limpio = motivoLimpio(motivo);

  function pedir() {
    if (!motivoValido(limpio) || enviando) return;
    setError(null);
    empezar(async () => {
      const r = await pedirBorrado({ tipo: que.tipo, conversacionId, mensajeId: que.tipo === "mensaje" ? que.mensajeId : null, motivo: limpio }).catch(() => ({ error: "No se pudo mandar la petición. Inténtalo de nuevo." }));
      if ("error" in r) setError(r.error);
      else alPedido(r.autorizan);
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo={que.tipo === "chat" ? "Pedir borrar el chat" : "Pedir borrar el mensaje"} ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          pedir();
        }}
      >
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">{que.tipo === "chat" ? "Chat con" : `Mensaje en el chat con ${nombre}`}</span>
          <span className="text-sm font-medium [overflow-wrap:anywhere]">{que.tipo === "chat" ? nombre : que.resumen}</span>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>¿Por qué quieres borrarlo?</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} required data-enfocar placeholder="Ej: se mandó a otra persona por error" className={`${fieldClass} w-full resize-y`} />
          <span className="text-xs text-muted-foreground">
            No se borra al instante: lo autoriza la persona por encima de ti. Si lo autoriza, se oculta de la bandeja; no se pierde y un administrador lo puede recuperar.
          </span>
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={enviando} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={!motivoValido(limpio) || enviando} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            {enviando ? "Pidiendo…" : "Pedir autorización"}
          </button>
        </div>
        {!motivoValido(limpio) && motivo.length > 0 && <p className="sr-only">Escribe al menos {MIN_MOTIVO} letras.</p>}
      </form>
    </Ventana>
  );
}
