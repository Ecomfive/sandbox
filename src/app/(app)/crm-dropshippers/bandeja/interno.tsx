"use client";

import { useRef, useState } from "react";
import { claseOpcionPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { opcionesDeSalas, type AreaChat, type SalaInterna } from "@/lib/crm/chat-interno";

/**
 * «Chat interno» (29 oct 2026, pedido de Alcides; por salas desde el 30 oct 2026, pedido de Jhokser): un botón que abre el chat entre las áreas de la empresa sin perder el chat del
 * cliente (se vuelve con «Volver a …»). Cada quien elige **con quién habla**: cada una de las otras áreas (Atención, Comercial, Dirección) o todas a la vez, y entra a su copia de
 * esa sala. Cada opción dice cuántos mensajes tiene sin leer. Se escribe dentro del sistema, no por WhatsApp.
 */
export function BotonChatInterno({
  miArea,
  alElegir,
  ocupado,
  internos = [],
  conTexto = false,
}: {
  /** El área de la persona: decide con quién puede hablar. */
  miArea: AreaChat;
  alElegir: (sala: SalaInterna) => void;
  ocupado: boolean;
  /** Las salas que ya existen para esta persona, con sus mensajes sin leer (para el contador y para cada opción). */
  internos?: { sala: string; noLeidos: number }[];
  /** Con el texto «Chat interno» al lado (en la barra de la bandeja). */
  conTexto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = opcionesDeSalas(miArea);
  const sinLeer = (sala: string) => internos.filter((c) => c.sala === sala).reduce((t, c) => t + c.noLeidos, 0);
  const total = opciones.reduce((t, o) => t + sinLeer(o.sala), 0);
  return (
    <>
      <Tooltip texto="Chat interno entre áreas">
        <button
          ref={boton}
          type="button"
          aria-label={total ? `Chat interno entre áreas, ${total} sin leer` : "Chat interno entre áreas"}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          disabled={ocupado}
          onClick={() => setAbierto((x) => !x)}
          className={`relative inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60 ${conTexto ? "border border-[var(--wa-borde)]" : ""} ${anilloFoco}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <path d="M9 11h.01M12 11h.01M15 11h.01" />
          </svg>
          <span className={conTexto ? "" : "hidden sm:inline"}>{conTexto ? "Chat interno" : "Interno"}</span>
          {total > 0 && (
            <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--wa-acento,#25d366)] px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {total}
            </span>
          )}
        </button>
      </Tooltip>
      {abierto && (
        <PanelCelda ancla={boton} etiqueta="Chat interno" ancho={280} alCerrar={(m) => (setAbierto(false), m === "escape" && boton.current?.focus())}>
          <p className="m-0 px-3 pt-2.5 pb-1 text-xs text-muted-foreground">¿Con quién quieres hablar?</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5 pt-0">
            {opciones.map((o) => (
              <li key={o.sala}>
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(false);
                    alElegir(o.sala);
                  }}
                  className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{o.etiqueta}</span>
                    <span className="text-xs text-muted-foreground">{o.detalle}</span>
                  </span>
                  {sinLeer(o.sala) > 0 && <span className="text-xs font-semibold text-primario tabular-nums">{sinLeer(o.sala)} sin leer</span>}
                </button>
              </li>
            ))}
          </ul>
        </PanelCelda>
      )}
    </>
  );
}
