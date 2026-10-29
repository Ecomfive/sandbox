"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { renombrarContacto } from "./rapidas-actions";

/**
 * «Cambiar el nombre» de un contacto (29 oct 2026): el nombre con que el equipo ve ese chat. Manda sobre el del CRM y el del perfil de WhatsApp (que cambia con cada mensaje);
 * vaciarlo vuelve al de siempre. No cambia nada del dropshipper en el CRM.
 */
export function VentanaNombreContacto({
  conversacionId,
  nombreActual,
  personalizado,
  alCerrar,
  alListo,
}: {
  conversacionId: string;
  nombreActual: string;
  personalizado: string | null;
  alCerrar: () => void;
  alListo: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(personalizado ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  function guardar(valor: string) {
    setError(null);
    empezar(async () => {
      const r = await renombrarContacto(conversacionId, valor).catch(() => ({ error: "No se pudo guardar el nombre." }));
      if ("error" in r) setError(r.error);
      else alListo(r.nombre ? `Ahora se ve como «${r.nombre}».` : "Vuelve a verse con su nombre de siempre.");
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Cambiar el nombre del contacto" ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          guardar(nombre);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} data-enfocar placeholder={nombreActual} className={`${fieldClass} w-full`} />
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {personalizado && (
            <button type="button" onClick={() => guardar("")} disabled={ocupado} className={`mr-auto inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50 ${anilloFoco}`}>
              Quitar el nombre cambiado
            </button>
          )}
          <button type="button" onClick={alCerrar} disabled={ocupado} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || !nombre.trim() || nombre.trim() === (personalizado ?? "")} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            Guardar
          </button>
        </div>
      </form>
    </Ventana>
  );
}
