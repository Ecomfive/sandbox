"use client";

import { Tooltip } from "@/components/ui/tooltip";

/** Las iniciales de un nombre («Nicole Muñoz» → «NM»). */
export const iniciales = (nombre: string) =>
  nombre
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** El color de la foto de cada nombre, siempre el mismo (oscuros: el texto blanco se lee bien). */
const COLORES_FOTO = ["#a1517a", "#2f7d6d", "#4a6fa5", "#8a6d1d", "#6b5b95", "#b0573c", "#3d7a8f", "#7a5c3e"];
export function colorFoto(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_FOTO[h % COLORES_FOTO.length];
}

/**
 * Una persona del equipo como un globito (29 oct 2026, pedido de Alcides): su foto del sistema o, sin foto, sus iniciales sobre su color. Al pasar el
 * cursor (o con el teclado) dice su nombre y su cargo: «Nicole Muñoz · Atención al cliente».
 */
export function GloboPersona({ nombre, cargo, foto, prefijo }: { nombre: string; cargo: string | null; foto: string | null; prefijo?: string }) {
  const texto = `${prefijo ? `${prefijo} ` : ""}${nombre}${cargo ? ` · ${cargo}` : ""}`;
  return (
    <Tooltip texto={texto}>
      <span
        role="img"
        tabIndex={0}
        aria-label={texto}
        style={foto ? undefined : { backgroundColor: colorFoto(nombre) }}
        className="inline-flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ring-2 ring-[var(--wa-fondo)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-acento)]"
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- la foto es del bucket público de avatares; no pasa por el optimizador.
          <img src={foto} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{iniciales(nombre)}</span>
        )}
      </span>
    </Tooltip>
  );
}

/** Lo que se respondió desde la app del celular (coexistencia): un globito con un celular. */
export function GloboCelular() {
  return (
    <Tooltip texto="Desde el celular">
      <span
        role="img"
        tabIndex={0}
        aria-label="Desde el celular"
        className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-texto)] ring-2 ring-[var(--wa-fondo)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-acento)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      </span>
    </Tooltip>
  );
}
