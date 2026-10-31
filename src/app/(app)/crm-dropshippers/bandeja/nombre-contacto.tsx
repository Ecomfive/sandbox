"use client";

import { useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { renombrarContacto } from "./rapidas-actions";

const botonMini = `flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;

/**
 * «Cambiar el nombre» de un contacto, en el mismo lugar donde se ve el nombre (cabecera del chat y ficha), sin ventana encima (29 oct 2026). El nombre se vuelve un campo: Enter o la
 * palomita guardan, Escape o la X lo dejan como estaba. Ese nombre manda sobre el del CRM y el del perfil de WhatsApp (que cambia con cada mensaje); vaciarlo vuelve al de siempre
 * («Quitar el nombre cambiado»). No cambia nada del dropshipper en el CRM.
 */
export function EditorNombreContacto({
  conversacionId,
  nombreActual,
  personalizado,
  centrado = false,
  alCerrar,
  alListo,
}: {
  conversacionId: string;
  nombreActual: string;
  personalizado: string | null;
  centrado?: boolean;
  alCerrar: () => void;
  alListo: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(personalizado ?? nombreActual);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const cerrando = useRef(false);

  function guardar(valor: string) {
    if (ocupado) return;
    setError(null);
    empezar(async () => {
      const r = await renombrarContacto(conversacionId, valor).catch(() => ({ error: "No se pudo guardar el nombre." }));
      if ("error" in r) return setError(r.error);
      cerrando.current = true;
      alListo(r.nombre ? `Ahora se ve como «${r.nombre}».` : "Vuelve a verse con su nombre de siempre.");
    });
  }
  function cancelar() {
    cerrando.current = true;
    alCerrar();
  }
  const cambio = nombre.trim() !== "" && nombre.trim() !== (personalizado ?? nombreActual);

  return (
    <form
      className={`flex min-w-0 flex-1 flex-col gap-1 ${centrado ? "items-center" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (cambio) guardar(nombre);
        else cancelar();
      }}
    >
      <span className="flex w-full min-w-0 items-center gap-1">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Nombre del contacto</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancelar();
              }
            }}
            // Salir del campo sin cambiar nada lo cierra; con un cambio sin guardar se queda abierto para no perderlo.
            onBlur={(e) => {
              if (cerrando.current || ocupado || cambio) return;
              if (e.relatedTarget instanceof HTMLElement && e.currentTarget.form?.contains(e.relatedTarget)) return;
              cancelar();
            }}
            className={`h-9 w-full min-w-0 rounded-lg border-0 bg-[var(--wa-panel)] px-3 text-[15px] text-[var(--wa-texto)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wa-acento)] ${centrado ? "text-center" : ""}`}
          />
        </label>
        <button type="submit" disabled={ocupado || !cambio} aria-label="Guardar el nombre" title="Guardar" className={botonMini}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5L20 7" />
          </svg>
        </button>
        <button type="button" onClick={cancelar} disabled={ocupado} aria-label="Cancelar el cambio de nombre" title="Cancelar" className={botonMini}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </span>
      {personalizado && (
        <button type="button" onClick={() => guardar("")} disabled={ocupado} className={`rounded text-[12.5px] text-[var(--wa-sec)] underline-offset-2 hover:underline disabled:opacity-50 ${centrado ? "self-center" : "self-start"} ${anilloFoco}`}>
          Quitar el nombre cambiado
        </button>
      )}
      {error && (
        <p role="alert" className="m-0 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
