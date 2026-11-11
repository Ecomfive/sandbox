import type { SVGProps } from "react";

/**
 * Ícono del módulo Deliverys (una moto de reparto con su caja). Mismo trazo que `src/lib/nav-icons.tsx`; para el menú
 * se copia allí como `DeliverysIcon` y se mapea `"/deliverys": DeliverysIcon`.
 */
export function DeliverysIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="18.5" cy="17" r="2.5" />
      <path d="M8 17h6.5l2-5H13" />
      <path d="M16.5 12 15 7h-2" />
      <rect x="3" y="8" width="6" height="5" rx="1" />
    </svg>
  );
}
