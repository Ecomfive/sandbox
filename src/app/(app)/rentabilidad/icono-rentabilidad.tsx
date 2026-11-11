import type { SVGProps } from "react";

/**
 * Ícono del módulo Rentabilidad por tienda (escalones que bajan, como una cascada de margen). Mismo trazo que
 * `src/lib/nav-icons.tsx`; para el menú se copia allí como `RentabilidadIcon` y se mapea `"/rentabilidad": RentabilidadIcon`.
 */
export function RentabilidadIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 16V5h3v11" />
      <path d="M10 16V8h3v8" />
      <path d="M15 16v-5h3v5" />
    </svg>
  );
}
