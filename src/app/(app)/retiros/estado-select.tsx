"use client";

import { useTransition } from "react";
import { cambiarEstadoRetiro } from "./actions";
import { ESTADO_ETIQUETA } from "@/lib/retiros/estados";

const ESTADOS_EDITABLES = ["abierto", "novedad", "cerrado"] as const;

const CLASE_ESTADO: Record<string, string> = {
  abierto: "bg-accent text-accent-foreground",
  novedad: "bg-destructive-soft text-destructive",
  cerrado: "bg-success-soft text-success",
};

/** Estado editable directo desde la tabla, sin pasar por el formulario de cierre — pensado
 * para marcar a mano una novedad detectada en Dropi, o archivar como cerrado. "Cancelado"
 * no aparece aquí: sigue siendo el botón Cancelar aparte. `relative z-10` es necesario
 * porque la fila entera es un enlace estirado (ver ConsolidadoToggle). */
export function EstadoSelect({ id, estado }: { id: string; estado: string }) {
  const [pending, startTransition] = useTransition();

  if (!ESTADOS_EDITABLES.includes(estado as (typeof ESTADOS_EDITABLES)[number])) {
    return null;
  }

  return (
    <select
      value={estado}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        const nuevoEstado = e.target.value;
        const formData = new FormData();
        formData.set("id", id);
        formData.set("estado", nuevoEstado);
        startTransition(() => {
          cambiarEstadoRetiro(formData);
        });
      }}
      aria-label="Estado del retiro"
      className={`relative z-10 cursor-pointer rounded-full border-0 py-0.5 pr-5 pl-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        CLASE_ESTADO[estado] ?? ""
      }`}
    >
      {ESTADOS_EDITABLES.map((valor) => (
        <option key={valor} value={valor}>
          {ESTADO_ETIQUETA[valor]}
        </option>
      ))}
    </select>
  );
}
