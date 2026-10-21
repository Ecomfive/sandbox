import type { SVGProps } from "react";

// Íconos de Compras › Envíos: la vía (barco, avión, camión) y el estado de una ruta. Decorativos: el texto va siempre al lado.

const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function BarcoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M1.8 10.5l1.6 3.2h9.2l1.6-3.2H1.8z" />
      <path d="M4 10.5V6.8h8v3.7" />
      <path d="M8 6.8V3h2.6" />
    </svg>
  );
}

export function AvionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M14.2 1.8L1.6 7.2l4.2 1.9 1.6 5.1 1.8-3.9z" />
      <path d="M5.8 9.1l8.4-7.3" />
    </svg>
  );
}

export function CamionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M1.5 4h7.5v7.5H1.5z" />
      <path d="M9 6.5h3l2.5 2.5v2.5H9" />
      <circle cx="4.5" cy="12" r="1.3" />
      <circle cx="11.5" cy="12" r="1.3" />
    </svg>
  );
}

/** El ícono de una vía (mar, aire, tierra). */
export function IconoVia({ via, ...props }: { via: string } & SVGProps<SVGSVGElement>) {
  if (via === "mar") return <BarcoIcon {...props} />;
  if (via === "aire") return <AvionIcon {...props} />;
  return <CamionIcon {...props} />;
}

const chico = { width: 12, height: 12 } as const;

export function TrianguloIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...chico} strokeWidth={1.8} {...props}>
      <path d="M8 2l6.5 11.5h-13L8 2z" />
      <path d="M8 6.8v3M8 12v.1" />
    </svg>
  );
}

export function VistoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...chico} strokeWidth={2.2} {...props}>
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

export function RelojIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...chico} strokeWidth={1.8} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}

export function SinPlazoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...chico} strokeWidth={1.8} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.2 8h5.6" />
    </svg>
  );
}
