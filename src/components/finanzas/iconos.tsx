import type { SVGProps } from "react";

// Íconos del menú para Flujo de caja y Distribución de utilidades, con el mismo trazo que `src/lib/nav-icons.tsx`
// (24×24, línea de 1,75). Se pueden mover allá tal cual.

function Icon(props: SVGProps<SVGSVGElement>) {
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
    />
  );
}

/** Flujo de caja: dinero que entra (flecha abajo) y sale (flecha arriba) de una caja. */
export function FlujoCajaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M8 3v5m0 0-2-2m2 2 2-2" />
      <path d="M16 8V3m0 0-2 2m2-2 2 2" />
      <path d="M12 16h.01" />
    </Icon>
  );
}

/** Distribución de utilidades: un círculo partido en porciones. */
export function UtilidadesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.4 6.4" />
      <path d="M12 12 4.2 16.5" />
    </Icon>
  );
}
