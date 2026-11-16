"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { FlechaAbajoIcon, RayoIcon, RobotIcon } from "@/lib/nav-icons";

// El control del bot en el chat de WhatsApp de un pedido de tienda (14 nov 2026, pedido de Hernán, como el de iComfly): un botón con el estado que despliega las dos cosas
// que se pueden pausar solo en este chat, «La IA» (responde sola) y «Los flujos» (mensajes programados y plantillas automáticas), cada una con su interruptor.

export function textoEstadoBot({
  iaPausada,
  flujosPausados,
  pausadoPor,
}: {
  iaPausada: boolean;
  flujosPausados: boolean;
  pausadoPor: string | null;
}): string {
  if (iaPausada && flujosPausados)
    return `Bot en pausa${pausadoPor ? ` · lo atiende ${pausadoPor}` : ""}`;
  if (iaPausada)
    return `IA en pausa${pausadoPor ? ` · lo atiende ${pausadoPor}` : ""}`;
  if (flujosPausados) return "Flujos en pausa";
  return "Bot respondiendo";
}

function Interruptor({
  activo,
  etiqueta,
  deshabilitado,
  alCambiar,
}: {
  activo: boolean;
  etiqueta: string;
  deshabilitado: boolean;
  alCambiar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={alCambiar}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? "bg-success" : "bg-border-control"} ${anilloFoco}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${activo ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function Fila({
  icono,
  titulo,
  estado,
  interruptor,
}: {
  icono: ReactNode;
  titulo: string;
  estado: string;
  interruptor: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1.5 py-2">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
      >
        {icono}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs text-muted-foreground">{estado}</span>
      </span>
      {interruptor}
    </div>
  );
}

export function ControlBotChat({
  iaPausada,
  flujosPausados,
  flujosDisponibles,
  pausadoPor,
  deshabilitado,
  alCambiarIA,
  alCambiarFlujos,
}: {
  iaPausada: boolean;
  flujosPausados: boolean;
  flujosDisponibles: boolean;
  pausadoPor: string | null;
  /** No se puede cambiar nada (solo lectura, ocupado o el chat todavía no existe en iComfly). */
  deshabilitado: boolean;
  alCambiarIA: (pausar: boolean) => void;
  alCambiarFlujos: (pausar: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node))
        setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const todoPausado = iaPausada && flujosPausados;
  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border border-border-control bg-card px-2 py-1 text-xs font-medium hover:bg-muted ${anilloFoco}`}
      >
        <span className="relative grid h-5 w-5 place-items-center text-foreground">
          <RobotIcon className="h-4.5 w-4.5" />
          <span
            aria-hidden="true"
            className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card ${todoPausado ? "bg-border-control" : "bg-success"}`}
          />
        </span>
        {textoEstadoBot({ iaPausada, flujosPausados, pausadoPor })}
        <FlechaAbajoIcon
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>
      {abierto && (
        <div
          id={idPanel}
          role="dialog"
          aria-label="Bot de este chat"
          className="absolute top-full left-0 z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-2 shadow-lg"
        >
          <p className="m-0 px-1.5 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
            Solo este chat
          </p>
          <Fila
            icono={<RobotIcon className="h-4.5 w-4.5" />}
            titulo="La IA"
            estado={iaPausada ? "En pausa" : "Responde sola"}
            interruptor={
              <Interruptor
                activo={!iaPausada}
                etiqueta="La IA responde sola en este chat"
                deshabilitado={deshabilitado}
                alCambiar={() => alCambiarIA(!iaPausada)}
              />
            }
          />
          <Fila
            icono={<RayoIcon className="h-4.5 w-4.5" />}
            titulo="Los flujos"
            estado={
              !flujosDisponibles
                ? "No disponible"
                : flujosPausados
                  ? "En pausa"
                  : "Activos"
            }
            interruptor={
              <Interruptor
                activo={!flujosPausados}
                etiqueta="Los flujos programados siguen en este chat"
                deshabilitado={deshabilitado || !flujosDisponibles}
                alCambiar={() => alCambiarFlujos(!flujosPausados)}
              />
            }
          />
        </div>
      )}
    </div>
  );
}
