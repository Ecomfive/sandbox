"use client";

import { useRef, useState } from "react";
import { claseOpcionPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { opcionesDeSalas, type AreaChat, type SalaInterna } from "@/lib/crm/chat-interno";
import type { RemitenteInterno } from "./datos-bandeja";
import { colorFoto, iniciales } from "./globo-persona";

/** Cuántos globitos de quien escribió caben en el botón; los demás van como «+N». Pocos y chicos, para que el botón casi no crezca (pedido de Hernán). */
const MAX_GLOBOS = 2;

/** Junta a quien escribió en varias salas en una sola lista (sumando sus mensajes), el que más escribió primero. */
function juntarRemitentes(listas: RemitenteInterno[][]): RemitenteInterno[] {
  const grupos = new Map<string, RemitenteInterno>();
  for (const r of listas.flat()) {
    const clave = r.id ?? `nombre:${r.nombre}`;
    const g = grupos.get(clave);
    if (g) grupos.set(clave, { ...g, mensajes: g.mensajes + r.mensajes });
    else grupos.set(clave, { ...r });
  }
  return [...grupos.values()].sort((a, b) => b.mensajes - a.mensajes);
}

/** «Nicole Muñoz (2) y Alcides Andrade (1)». */
const quienesEscribieron = (rs: RemitenteInterno[]) => {
  const t = rs.map((r) => `${r.nombre} (${r.mensajes})`);
  return t.length > 1 ? `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}` : (t[0] ?? "");
};

/**
 * Los globitos de quien escribió lo que está sin leer (30 oct 2026, pedido de Hernán): pequeños, encimados, con la foto o las iniciales sobre su color (los mismos de «La lleva»). Si
 * son más de `MAX_GLOBOS`, el resto va como «+N». Solo se ven; quién es cada uno lo dice el texto del botón.
 */
function GlobosRemitentes({ remitentes }: { remitentes: RemitenteInterno[] }) {
  if (!remitentes.length) return null;
  const vistos = remitentes.slice(0, MAX_GLOBOS);
  const resto = remitentes.length - vistos.length;
  return (
    <span aria-hidden="true" className="flex items-center">
      {vistos.map((r, i) => (
        <span
          key={r.id ?? r.nombre}
          className={`flex h-4 w-4 items-center justify-center overflow-hidden rounded-full text-[7px] leading-none font-bold text-white ring-[1.5px] ring-[var(--wa-fondo,var(--background))] ${i ? "-ml-1" : ""}`}
          style={r.foto ? undefined : { backgroundColor: colorFoto(r.nombre) }}
        >
          {r.foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- la foto es del bucket público de avatares; no pasa por el optimizador.
            <img src={r.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            iniciales(r.nombre)
          )}
        </span>
      ))}
      {resto > 0 && (
        <span className="-ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[8px] leading-none font-bold text-muted-foreground ring-[1.5px] ring-[var(--wa-fondo,var(--background))]">
          +{resto}
        </span>
      )}
    </span>
  );
}

/**
 * «Chat interno» (29 oct 2026, pedido de Alcides; por salas desde el 30 oct 2026, pedido de Jhokser): un botón que abre el chat entre las áreas de la empresa sin perder el chat del
 * cliente (se vuelve con «Volver a …»). Cada quien elige **con quién habla**: cada una de las otras áreas (Atención, Comercial, Dirección) o todas a la vez, y entra a su copia de
 * esa sala. Se escribe dentro del sistema, no por WhatsApp. Por fuera (30 oct 2026, pedido de Hernán) el botón muestra cuántos mensajes hay sin leer y los globitos de **quién los
 * mandó**; cada opción dice lo mismo de su sala.
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
  /** Las salas que ya existen para esta persona, con sus mensajes sin leer y quién los mandó (para el botón y para cada opción). */
  internos?: { sala: string; noLeidos: number; remitentes?: RemitenteInterno[] }[];
  /** Con el texto «Chat interno» al lado (en la barra de la bandeja). */
  conTexto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = opcionesDeSalas(miArea);
  const deSala = (sala: string) => internos.filter((c) => c.sala === sala);
  const sinLeer = (sala: string) => deSala(sala).reduce((t, c) => t + c.noLeidos, 0);
  const remitentesDe = (sala: string) => juntarRemitentes(deSala(sala).filter((c) => c.noLeidos > 0).map((c) => c.remitentes ?? []));
  const total = opciones.reduce((t, o) => t + sinLeer(o.sala), 0);
  const remitentes = juntarRemitentes(opciones.map((o) => remitentesDe(o.sala)));
  const quien = quienesEscribieron(remitentes);
  const resumen = total ? `${total} sin leer${quien ? `: ${quien}` : ""}` : "";
  return (
    <>
      <Tooltip texto={resumen ? `Chat interno · ${resumen}` : "Chat interno entre áreas"}>
        <button
          ref={boton}
          type="button"
          aria-label={resumen ? `Chat interno entre áreas, ${resumen}` : "Chat interno entre áreas"}
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
          <span className={`whitespace-nowrap ${conTexto ? "" : "hidden sm:inline"}`}>{conTexto ? "Chat interno" : "Interno"}</span>
          {total > 0 && (
            <span className="flex items-center gap-1">
              <GlobosRemitentes remitentes={remitentes} />
              <span aria-hidden="true" className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wa-acento,#25d366)] px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                {total}
              </span>
            </span>
          )}
        </button>
      </Tooltip>
      {abierto && (
        <PanelCelda ancla={boton} etiqueta="Chat interno" ancho={300} alCerrar={(m) => (setAbierto(false), m === "escape" && boton.current?.focus())}>
          <p className="m-0 px-3 pt-2.5 pb-1 text-xs text-muted-foreground">¿Con quién quieres hablar?</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5 pt-0">
            {opciones.map((o) => {
              const n = sinLeer(o.sala);
              const rs = remitentesDe(o.sala);
              return (
                <li key={o.sala}>
                  <button
                    type="button"
                    onClick={() => {
                      setAbierto(false);
                      alElegir(o.sala);
                    }}
                    className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{o.etiqueta}</span>
                      <span className="text-xs text-muted-foreground">{n > 0 && rs.length ? `De ${quienesEscribieron(rs)}` : o.detalle}</span>
                    </span>
                    {n > 0 && (
                      <span className="flex flex-none items-center gap-1.5">
                        <GlobosRemitentes remitentes={rs} />
                        <span className="text-xs font-semibold text-primario tabular-nums">{n} sin leer</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </PanelCelda>
      )}
    </>
  );
}
