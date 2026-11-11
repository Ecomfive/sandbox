import type { SVGProps } from "react";

/**
 * Ícono del módulo Clientes y marketing (una persona y una flecha que vuelve: clientes que recompran). Mismo trazo que
 * `src/lib/nav-icons.tsx`; para el menú se copia allí como `ClientesMarketingIcon` y se mapea
 * `"/clientes-marketing": ClientesMarketingIcon`.
 */
export function ClientesMarketingIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.5a5 5 0 0 1 5 5" />
      <path d="M20.5 11.5 22 9.5" />
      <path d="M20.5 11.5 18.5 10.5" />
    </svg>
  );
}
