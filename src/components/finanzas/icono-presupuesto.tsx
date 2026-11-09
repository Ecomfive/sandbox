import type { SVGProps } from "react";

// Ícono del menú para Presupuesto y escenarios, con el mismo trazo que `src/lib/nav-icons.tsx` (24×24, línea de 1,75).
// Se puede mover allá tal cual.

/** Presupuesto: una meta (línea punteada) sobre barras que suben. */
export function PresupuestoIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 21h18" />
      <path d="M6 17v-4M11 17v-6M16 17V9" />
      <path d="M3 6h2m3 0h2m3 0h2m3 0h3" />
      <path d="m19 3 2 3-2 3" />
    </svg>
  );
}
