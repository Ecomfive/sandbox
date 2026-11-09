import type { SVGProps } from "react";

/**
 * Ícono del módulo Conciliación bancaria (el edificio de un banco con una marca de cotejado). Mismo trazo que
 * `src/lib/nav-icons.tsx`; para el menú se importa allí y se mapea `"/conciliacion-bancaria": ConciliacionBancariaIcon`.
 */
export function ConciliacionBancariaIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 9.5 11 5l8 4.5" />
      <path d="M5 10v6M9 10v6M13 10v3" />
      <path d="M3.5 19h8" />
      <path d="m15 18 2 2 4-4.5" />
    </svg>
  );
}
