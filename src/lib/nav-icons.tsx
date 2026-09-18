import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 12L12 4l8 8" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </Icon>
  );
}

export function ProveeduriaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 8l9-4 9 4-9 4-9-4Z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </Icon>
  );
}

export function TiendaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4" />
      <path d="M3 9h18l-1 3a2 2 0 0 1-2 1.5H6A2 2 0 0 1 4 12L3 9Z" />
      <path d="M5 13.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5.5" />
      <path d="M10 20v-4h4v4" />
    </Icon>
  );
}

export function CatalogoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20.6 12.5l-8.1 8.1a2 2 0 0 1-2.8 0l-6.3-6.3a2 2 0 0 1 0-2.8l8.1-8.1a2 2 0 0 1 1.4-.6h5.7a2 2 0 0 1 2 2v5.7a2 2 0 0 1-.6 1.4Z" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </Icon>
  );
}

export function RecursosHumanosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M15 13.5a6.5 6.5 0 0 1 6.5 6.5" />
    </Icon>
  );
}

export function AlertaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  );
}

export function ProductoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.5 3H6a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .59 1.41l9.5 9.5a2 2 0 0 0 2.82 0l6.5-6.5a2 2 0 0 0 0-2.82l-9.5-9.5A2 2 0 0 0 12.5 3Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </Icon>
  );
}

export function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2" />
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M16 13.5h3" />
    </Icon>
  );
}

export function ExtractoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6" />
    </Icon>
  );
}

export function GastoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  );
}

export function ConciliacionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3.5 3.5 0 0 0 7 0l-3-6Z" />
      <path d="M19 7l-3 6a3.5 3.5 0 0 0 7 0l-3-6Z" />
    </Icon>
  );
}

export function InventarioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="10" width="7" height="7" rx="1" />
      <rect x="13" y="10" width="7" height="7" rx="1" />
      <rect x="8.5" y="3" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function PedidoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  );
}

export function DropshipperIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M10.5 20a5.5 5.5 0 0 1 11 0" />
    </Icon>
  );
}

export function InteligenciaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 19h16" />
      <path d="M7 19v-6M12 19V6M17 19v-9" />
    </Icon>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export const SECTION_ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  Proveeduría: ProveeduriaIcon,
  Tiendas: TiendaIcon,
  Catálogo: CatalogoIcon,
  "Recursos Humanos": RecursosHumanosIcon,
};
