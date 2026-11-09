import type { SVGProps } from "react";

// Ícono del menú para Tesorería, con el mismo trazo que `src/lib/nav-icons.tsx` (24×24, línea de 1,75).

/** Tesorería: una caja fuerte con su perilla. */
export function TesoreriaIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="4" width="18" height="15" rx="2" />
      <circle cx="12" cy="11.5" r="3" />
      <path d="M12 8.5v1M12 13.5v1M9 11.5h1M14 11.5h1" />
      <path d="M6 19v1.5M18 19v1.5" />
    </svg>
  );
}
