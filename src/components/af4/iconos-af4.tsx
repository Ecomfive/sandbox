import type { SVGProps } from "react";

// Íconos propios del Portal AF4 (mismo trazo de 1.75 que los del menú, `src/lib/nav-icons.tsx`).

export function ImprimirIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 8V4h10v4" />
      <rect x="3.5" y="8" width="17" height="8" rx="1.5" />
      <path d="M7 14h10v6H7z" />
    </svg>
  );
}

/** Flecha de una variación: sube, baja o igual (una raya). */
export function FlechaVariacionIcon({ direccion, ...props }: SVGProps<SVGSVGElement> & { direccion: "sube" | "baja" | "igual" }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {direccion === "sube" && <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />}
      {direccion === "baja" && <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />}
      {direccion === "igual" && <path d="M2.5 6h7" />}
    </svg>
  );
}

/** Reloj: «Actualizado a…». */
export function RelojIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Base de datos: «Datos hasta…». */
export function DatosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
    </svg>
  );
}
