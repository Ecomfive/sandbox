"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVENTOS_USO } from "@/components/latido-presencia";
import { sinActividad, textoSinActividad, textoVolvio } from "@/lib/rendimiento/aviso-inactividad";

/** Cada cuánto se revisa (y se actualiza el contador del aviso). */
const REVISAR_MS = 15_000;

type Estado = { tipo: "inactiva"; desde: number; ahora: number } | { tipo: "volvio"; desde: number; hasta: number } | null;

/**
 * El aviso de 5 minutos sin actividad (7 nov 2026, pedido de Alcides): para que sea evidente para la persona que el sistema lo detectó.
 * Con la pestaña a la vista y 5 minutos sin mouse, teclado, desplazarse ni tocar la pantalla, se abre una ventana al centro que **bloquea
 * el sistema hasta pulsar «Entendido»** (mismo día, Alcides: «hasta que no le dé Entendido no pueda hacer nada»): «Sin actividad en el
 * sistema desde las 10:12 (6 min)», que va contando; al volver a usarlo dice «Estuviste 8 min sin actividad…» y sigue ahí hasta el botón.
 * Si la pestaña estaba escondida (otra pestaña, otra aplicación), sale al volver. Todo lo demás de la página queda `inert` (ni clic, ni
 * foco, ni teclado) y Escape no llega a las ventanas de abajo. Solo se monta para las personas marcadas en Configuración (`perfiles.aviso_inactividad`); no guarda nada.
 */
export function AvisoInactividad() {
  const [estado, setEstado] = useState<Estado>(null);
  const ultimoUso = useRef(0);
  const avisando = useRef(false);
  const boton = useRef<HTMLButtonElement>(null);
  const capa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ultimoUso.current = Date.now();
    const revisar = () => {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!avisando.current && sinActividad(ultimoUso.current, ahora)) avisando.current = true;
      if (avisando.current) setEstado((e) => (e?.tipo === "volvio" ? e : { tipo: "inactiva", desde: ultimoUso.current, ahora }));
    };
    const usar = () => {
      const ahora = Date.now();
      // Volvió después de 5 minutos o más: se fija cuánto estuvo sin actividad, aunque el aviso no alcanzara a verse (pestaña escondida).
      if (sinActividad(ultimoUso.current, ahora) && !avisando.current) avisando.current = true;
      if (avisando.current) {
        const desde = ultimoUso.current;
        setEstado((e) => (e?.tipo === "volvio" ? e : { tipo: "volvio", desde, hasta: ahora }));
        return;
      }
      ultimoUso.current = ahora;
    };
    const id = setInterval(revisar, REVISAR_MS);
    document.addEventListener("visibilitychange", revisar);
    for (const e of EVENTOS_USO) window.addEventListener(e, usar, { passive: true, capture: true });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", revisar);
      for (const e of EVENTOS_USO) window.removeEventListener(e, usar, { capture: true });
    };
  }, []);

  const abierto = estado !== null;
  // Mientras está abierto, el resto de la página no se puede usar: `inert` en todo lo demás y el teclado solo para «Entendido».
  useEffect(() => {
    if (!abierto) return;
    const propia = capa.current?.parentElement;
    const otros = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== propia && !n.inert);
    for (const n of otros) n.inert = true;
    boton.current?.focus();
    const teclas = (e: KeyboardEvent) => {
      if (e.target === boton.current && (e.key === "Enter" || e.key === " ")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      boton.current?.focus();
    };
    window.addEventListener("keydown", teclas, true);
    return () => {
      for (const n of otros) n.inert = false;
      window.removeEventListener("keydown", teclas, true);
    };
  }, [abierto]);

  const entendido = () => {
    avisando.current = false;
    ultimoUso.current = Date.now();
    setEstado(null);
  };

  if (!estado) return null;
  const texto = estado.tipo === "inactiva" ? textoSinActividad(estado.desde, estado.ahora) : textoVolvio(estado.desde, estado.hasta);
  return createPortal(
    <div ref={capa} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="aviso-inactividad-titulo" aria-describedby="aviso-inactividad-texto" className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
        <h2 id="aviso-inactividad-titulo" className="m-0 text-lg font-semibold">
          Sin actividad en el sistema
        </h2>
        <p id="aviso-inactividad-texto" className="m-0 text-sm text-muted-foreground">
          {texto}
        </p>
        <button ref={boton} type="button" onClick={entendido} className="mt-1 w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}
