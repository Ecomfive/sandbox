import type { SVGProps } from "react";

// Ícono del menú para Capital y riesgo, con el mismo trazo que `src/lib/nav-icons.tsx` (24×24, línea de 1,75).

/** Capital y riesgo: un escudo con una línea que sube. */
export function CapitalRiesgoIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
      <path d="M8.5 14l2.5-2.5 2 2 3-3.5" />
    </svg>
  );
}
