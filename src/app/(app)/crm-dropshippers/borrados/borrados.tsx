"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import { restaurarBorrado } from "./actions";
import type { BorradoVista } from "./datos-borrados";

const boton = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

/**
 * CRM › Borrados (2 nov 2026): lo que se borró desde el sistema, con quién y cuándo. Atención deja de verlo; Comercial, Dirección y los administradores lo siguen viendo
 * en el chat con su etiqueta. Un administrador lo puede restaurar.
 */
export function Borrados({ borrados, esAdmin }: { borrados: BorradoVista[]; esAdmin: boolean }) {
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  function restaurar(o: BorradoVista) {
    setEnCurso(o.id);
    empezar(async () => {
      const r = await restaurarBorrado(o.tipo, o.id).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      mostrarToast("error" in r ? r.error : "Restaurado: vuelve a verse en la bandeja.", "error" in r ? "destructive" : undefined);
    });
  }

  if (borrados.length === 0) return <p className="m-0 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No se ha borrado nada.</p>;

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
      {borrados.map((o) => (
        <li key={`${o.tipo}-${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{o.tipo === "chat" ? "Chat completo" : "Un mensaje"}</Badge>
              <span className="text-sm font-semibold [overflow-wrap:anywhere]">{o.chat}</span>
            </span>
            {o.vista && <span className="text-sm [overflow-wrap:anywhere]">{o.vista}</span>}
            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {o.por ? `Lo borró ${o.por}` : "Borrado"} · {formatearFechaHora(o.en)}
            </span>
          </div>
          {esAdmin && (
            <button type="button" disabled={ocupado} onClick={() => restaurar(o)} className={boton}>
              {enCurso === o.id ? "Restaurando…" : "Restaurar"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
