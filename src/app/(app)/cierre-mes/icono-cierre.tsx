import type { SVGProps } from "react";

/**
 * Ícono del módulo Cierre de mes (un calendario con un candado). Mismo trazo que `src/lib/nav-icons.tsx`; para el menú
 * se copia allí como `CierreMesIcon` y se mapea `"/cierre-mes": CierreMesIcon`.
 */
export function CierreMesIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M11 20H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M3 10h16" />
      <path d="M8 3v4" />
      <path d="M14 3v4" />
      <rect x="14" y="16" width="7" height="5" rx="1" />
      <path d="M15.5 16v-1.5a2 2 0 0 1 4 0V16" />
    </svg>
  );
}
