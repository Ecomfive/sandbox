import type { SVGProps } from "react";

/**
 * Ícono del módulo Ventas por tienda (una bolsa de compras con barras). Mismo trazo que `src/lib/nav-icons.tsx`; para el
 * menú se copia allí como `VentasTiendasIcon` y se mapea `"/ventas-tiendas": VentasTiendasIcon`.
 */
export function VentasTiendasIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M9.5 17v-2.5M12 17v-4.5M14.5 17v-3" />
    </svg>
  );
}
