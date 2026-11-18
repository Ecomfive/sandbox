"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { anilloFoco } from "@/components/ui/field";
import type { PersonaEnLinea } from "@/lib/en-linea";
import { quienesEnLinea } from "@/lib/presencia-actions";

const CADA_MS = 60_000;
const MAX_FOTOS = 4;

/**
 * Barra de arriba, solo para Admin y CEO (18 nov 2026): las fotos de quienes están en línea y «N en línea». Al pulsarlo se abre la lista con
 * el nombre y la página en que está cada uno. Se vuelve a leer cada minuto con la pestaña a la vista (los latidos también van cada minuto).
 */
export function EnLinea() {
  const [personas, setPersonas] = useState<PersonaEnLinea[]>([]);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    const traer = () => {
      if (document.visibilityState !== "visible") return;
      quienesEnLinea()
        .then((r) => vigente && setPersonas(r))
        .catch(() => {});
    };
    traer();
    const id = setInterval(traer, CADA_MS);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vigente = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", traer);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!personas.length) return <div />;
  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((a) => !a)}
        className={`inline-flex min-h-9 items-center gap-2 rounded-full px-1.5 text-[13px] text-muted-foreground hover:bg-muted ${anilloFoco}`}
      >
        <span className="flex -space-x-2">
          {personas.slice(0, MAX_FOTOS).map((p) => (
            <span key={p.id} className="relative rounded-full ring-2 ring-card">
              <AvatarPersona nombre={p.nombre} email="" avatarUrl={p.avatarUrl} tamano="sm" />
            </span>
          ))}
        </span>
        <span className="relative inline-flex">
          <span aria-hidden="true" className="absolute -left-3.5 -top-3 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
          {personas.length} en línea
        </span>
      </button>
      {abierto && (
        <div role="dialog" aria-label="Quién está en línea" className="absolute top-11 left-0 z-40 flex w-72 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
          {personas.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <AvatarPersona nombre={p.nombre} email="" avatarUrl={p.avatarUrl} tamano="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{p.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">{p.pagina ?? "Sin usar el sistema ahora"}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
