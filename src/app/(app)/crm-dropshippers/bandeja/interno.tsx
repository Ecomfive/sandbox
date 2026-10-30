"use client";

import { useRef, useState } from "react";
import { claseOpcionPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import type { AreaCrm } from "@/lib/crm/areas";

type NumeroEmpresa = { id: string; nombre: string; area: AreaCrm };

/**
 * «WhatsApp interno» (29 oct 2026, pedido de Alcides): un botón en la ventana del chat que abre el chat por WhatsApp entre los números de la empresa
 * (Atención ↔ Comercial), sin perder el chat del cliente (se vuelve con «Volver a …»). Se elige desde qué número se escribe y a cuál.
 */
export function BotonWhatsappInterno({
  numeros,
  areas,
  alElegir,
  ocupado,
  internos = [],
  conTexto = false,
}: {
  numeros: NumeroEmpresa[];
  /** Las áreas que ve la persona: puede escribir desde los números de esas áreas (el servidor lo vuelve a revisar). */
  areas: AreaCrm[];
  alElegir: (desdeId: string, haciaId: string) => void;
  ocupado: boolean;
  /** Los chats internos que ya existen, con sus mensajes sin leer (para el contador y para cada opción). */
  internos?: { numeroId: string; nombre: string; noLeidos: number }[];
  /** Con el texto «WhatsApp interno» al lado (en la barra de la bandeja). */
  conTexto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const pares = numeros.filter((d) => areas.includes(d.area)).flatMap((d) => numeros.filter((h) => h.id !== d.id).map((h) => ({ desde: d, hacia: h })));
  if (!pares.length) return null;
  const sinLeer = (desdeId: string, haciaNombre: string) => internos.filter((c) => c.numeroId === desdeId && c.nombre === haciaNombre).reduce((t, c) => t + c.noLeidos, 0);
  const total = pares.reduce((t, p) => t + sinLeer(p.desde.id, p.hacia.nombre), 0);
  return (
    <>
      <Tooltip texto="WhatsApp interno">
        <button
          ref={boton}
          type="button"
          aria-label={total ? `WhatsApp interno entre áreas, ${total} sin leer` : "WhatsApp interno entre áreas"}
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
          <span className={conTexto ? "" : "hidden sm:inline"}>{conTexto ? "WhatsApp interno" : "Interno"}</span>
          {total > 0 && (
            <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--wa-acento,#25d366)] px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {total}
            </span>
          )}
        </button>
      </Tooltip>
      {abierto && (
        <PanelCelda ancla={boton} etiqueta="WhatsApp interno" ancho={260} alCerrar={(m) => (setAbierto(false), m === "escape" && boton.current?.focus())}>
          <p className="m-0 px-3 pt-2.5 pb-1 text-xs text-muted-foreground">Escribir por WhatsApp a otra área</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5 pt-0">
            {pares.map(({ desde, hacia }) => (
              <li key={`${desde.id}-${hacia.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(false);
                    alElegir(desde.id, hacia.id);
                  }}
                  className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">A {hacia.nombre}</span>
                    <span className="text-xs text-muted-foreground">Desde {desde.nombre}</span>
                  </span>
                  {sinLeer(desde.id, hacia.nombre) > 0 && <span className="text-xs font-semibold text-primario tabular-nums">{sinLeer(desde.id, hacia.nombre)} sin leer</span>}
                </button>
              </li>
            ))}
          </ul>
        </PanelCelda>
      )}
    </>
  );
}
