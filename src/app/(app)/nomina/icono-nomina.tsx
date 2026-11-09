import type { SVGProps } from "react";

/**
 * Ícono del módulo Nómina (una hoja de pago con un sobre de billete). Mismo trazo que `src/lib/nav-icons.tsx`; para el
 * menú se copia allí como `NominaIcon` y se mapea `"/nomina": NominaIcon`.
 */
export function NominaIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
      <path d="M7 3.5h10" />
    </svg>
  );
}
