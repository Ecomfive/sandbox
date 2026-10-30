"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";

const TAM = 56;
const MARGEN = 8;
const PASO_TECLADO = 24;
const CLAVE = "crm-burbuja-whatsapp-v1";

type Pos = { x: number; y: number };

/** Deja la burbuja dentro de la ventana (si la pantalla se achica o se guardó una posición de otra pantalla). */
function dentro(p: Pos): Pos {
  const maxX = Math.max(MARGEN, window.innerWidth - TAM - MARGEN);
  const maxY = Math.max(MARGEN, window.innerHeight - TAM - MARGEN);
  return { x: Math.min(Math.max(MARGEN, p.x), maxX), y: Math.min(Math.max(MARGEN, p.y), maxY) };
}

/** Donde la dejó la persona la última vez (en este navegador) o, la primera vez, abajo a la derecha. */
function posicionInicial(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<Pos> | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return dentro({ x: Number(p.x), y: Number(p.y) });
  } catch {
    // Sin almacenamiento (ventana privada): arranca en su sitio de siempre.
  }
  return dentro({ x: window.innerWidth - TAM - 24, y: window.innerHeight - TAM - 96 });
}

function guardar(p: Pos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // No se pudo recordar: la burbuja sigue funcionando.
  }
}

/** El glifo de la bandeja: un globo de chat con un auricular, en el verde de la bandeja. */
function GloboConAuricular() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12Z" />
      <path d="M9.4 8.2c.2 3 2.6 5.6 5.7 6.4.8.2 1.6-.2 2-.9.1-.2 0-.5-.2-.6l-1.5-.9c-.2-.1-.5-.1-.6.1l-.6.7c-1.4-.5-2.7-1.8-3.2-3.2l.7-.6c.2-.1.2-.4.1-.6l-.9-1.5c-.1-.2-.4-.3-.6-.2-.6.4-.9 1.2-.7 2.3Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * La burbuja flotante de la bandeja de WhatsApp (30 oct 2026, pedido de Jhokser; reemplaza el botón grande de arriba de la lista del CRM): lleva a la bandeja
 * y muestra cuántos chats esperan respuesta. Se queda fija en la pantalla al bajar la lista y se arrastra a donde no estorbe (con el ratón, el dedo o, con el foco,
 * Mayús + flechas); el sitio queda recordado en este navegador. Un clic sin arrastrar abre la bandeja.
 */
export function BurbujaWhatsapp({ sinResponder }: { sinResponder: number }) {
  // La posición depende de la ventana: se calcula recién en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return enNavegador ? <Burbuja sinResponder={sinResponder} /> : null;
}

function Burbuja({ sinResponder }: { sinResponder: number }) {
  const [pos, setPos] = useState<Pos>(posicionInicial);
  const posRef = useRef(pos);
  const arrastre = useRef<{ id: number; dx: number; dy: number; x0: number; y0: number; movido: boolean } | null>(null);
  // Tras arrastrar, el clic que sigue al soltar no debe abrir la bandeja.
  const huboArrastre = useRef(false);

  function mover(p: Pos) {
    posRef.current = p;
    setPos(p);
  }

  function alPulsar(e: PointerEvent<HTMLAnchorElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { id: e.pointerId, dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y, x0: e.clientX, y0: e.clientY, movido: false };
    huboArrastre.current = false;
  }

  function alMover(e: PointerEvent<HTMLAnchorElement>) {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    if (!a.movido && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 5) return;
    a.movido = true;
    huboArrastre.current = true;
    mover(dentro({ x: e.clientX - a.dx, y: e.clientY - a.dy }));
  }

  function alSoltar(e: PointerEvent<HTMLAnchorElement>) {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    if (a.movido) guardar(posRef.current);
  }

  function alTeclear(e: KeyboardEvent<HTMLAnchorElement>) {
    if (!e.shiftKey) return;
    const delta = { ArrowLeft: [-PASO_TECLADO, 0], ArrowRight: [PASO_TECLADO, 0], ArrowUp: [0, -PASO_TECLADO], ArrowDown: [0, PASO_TECLADO] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const p = dentro({ x: posRef.current.x + delta[0], y: posRef.current.y + delta[1] });
    mover(p);
    guardar(p);
  }

  return (
    // Por encima de la lista y su barra (z-20) y por debajo de las fichas y ventanas (z-40).
    <div className="bandeja-wa fixed z-30" style={{ left: pos.x, top: pos.y, width: TAM, height: TAM }}>
      <Tooltip texto="Bandeja de WhatsApp · arrástrala si estorba">
        <Link
          href="/crm-dropshippers/bandeja"
          draggable={false}
          aria-label={sinResponder > 0 ? `Bandeja de WhatsApp, ${sinResponder} ${sinResponder === 1 ? "chat" : "chats"} sin responder. Mayús y flechas la mueven.` : "Bandeja de WhatsApp. Mayús y flechas la mueven."}
          onPointerDown={alPulsar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onKeyDown={alTeclear}
          onClick={(e) => {
            if (huboArrastre.current) {
              e.preventDefault();
              huboArrastre.current = false;
            }
          }}
          className={`relative flex touch-none select-none items-center justify-center rounded-full bg-[var(--wa-acento)] text-[var(--wa-acento-texto)] shadow-lg ring-1 ring-black/10 hover:brightness-110 active:cursor-grabbing ${anilloFoco}`}
          style={{ width: TAM, height: TAM, cursor: "grab" }}
        >
          <GloboConAuricular />
          {sinResponder > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold tabular-nums text-white ring-2 ring-background">
              {sinResponder > 99 ? "99+" : sinResponder}
            </span>
          )}
        </Link>
      </Tooltip>
    </div>
  );
}
