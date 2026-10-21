import type { SVGProps } from "react";

/** Los íconos del editor de landings (los mismos trazos del boceto aprobado): van con el color del texto. */
function Icono({ children, grosor = 2, ...props }: SVGProps<SVGSVGElement> & { grosor?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/** Crear con IA (Gemini o Claude). */
export const ChispaIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </Icono>
);

/** Volver a generar. */
export const RepetirIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Icono>
);

/** La tienda de Shopify. */
export const BolsaIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />
  </Icono>
);

/** Crear la landing desde cero. */
export const DesdeCeroIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </Icono>
);

/** Clonar una landing que ya vende. */
export const ClonarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icono>
);

export const SubirArchivoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Icono>
);

export const OjoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icono>
);

export const OjoTachadoIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
  </Icono>
);

export const SubirIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M6 15l6-6 6 6" />
  </Icono>
);

export const BajarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icono>
);

export const SiguienteIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icono {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icono>
);
