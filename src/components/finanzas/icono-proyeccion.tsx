import type { SVGProps } from "react";

// Ícono del menú para Proyección de caja, con el mismo trazo que `src/lib/nav-icons.tsx` (24×24, línea de 1,75).
// Se puede mover allá tal cual.

/** Proyección de caja: una línea de caja que sigue punteada hacia adelante, sobre un piso (la caja mínima). */
export function ProyeccionCajaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M3 20h18" />
      <path d="M3 15l4-4 3 2 3-4" />
      <path d="M13 9l2.5 1.5M17.5 11.5 21 7" strokeDasharray="2 2.5" />
      <path d="M3 17h18" strokeDasharray="1 3" />
    </svg>
  );
}
