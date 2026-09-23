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
      aria-hidden="true"
      focusable="false"
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

/** Bolsa de compras: la sección "Gestión de Tiendas" (distinta del ícono de vitrina de "Tiendas"). */
export function GestionTiendasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M6 8h12l1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 8Z" />
    </Icon>
  );
}

/** Nave con techo a dos aguas y una franja de carga: la sección "Sistema WMS" (bodega/almacén). */
export function WmsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 11h6" />
      <path d="M9 21v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V21" />
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

export function ActualizarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.36L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  );
}

export function ColumnasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </Icon>
  );
}

export function MasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function CerrarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icon>
  );
}

export function PersonaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </Icon>
  );
}

export function PrioridadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 3v18" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" />
    </Icon>
  );
}

export function EtiquetaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.59 3.41 21 12l-8.41 8.59a2 2 0 0 1-2.83 0L3 13.83V6a2.5 2.5 0 0 1 2.5-2.5H10a2 2 0 0 1 1.41.41Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </Icon>
  );
}

export function AgruparIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h11M4 18h6" />
    </Icon>
  );
}

/** Dos personas: quiénes tienen acceso (sin "+", porque el botón solo lista, no invita). */
export function AccesosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </Icon>
  );
}

export function FlechaIzquierdaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function FlechaArribaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Icon>
  );
}

export function FlechaAbajoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** Círculo con visto: "retiros cerrados". */
export function CerradoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </Icon>
  );
}

export function CalendarioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Icon>
  );
}

export function FiltroIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />
    </Icon>
  );
}

export function BuscarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Icon>
  );
}

export function EstadoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </Icon>
  );
}

export function DescargarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function ConfiguracionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Icon>
  );
}

/** Ícono de "arrastrar" (seis puntos), para asas de reordenar en listas. */
export function ArrastrarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

export function NotificacionesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function EstrellaIcon({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? "currentColor" : "none"}
      {...props}
    >
      <path d="m12 3 2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1L6.6 19.3l1.3-6-4.6-4.1 6.1-.6L12 3Z" />
    </svg>
  );
}

export function LapizIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function PapeleraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

/** Marcador: vistas guardadas de una tabla. */
export function VistasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" />
    </Icon>
  );
}

/** Dos eslabones: copiar el enlace a lo que se ve. */
export function EnlaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Icon>
  );
}

/** Dos flechas cruzadas: acción de "conciliar" un retiro (ir a la ficha a cerrarlo/consolidarlo). */
export function ConciliarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </Icon>
  );
}

/** Un documento con la esquina doblada y un clip al costado: adjuntar un archivo (el soporte de una conciliación). */
export function AdjuntoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10.5 4.5H15.5L20 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V13.5" />
      <path d="M15.5 4.5V8a1 1 0 0 0 1 1H20" />
      <path d="M7.25 9.5V5.25a1.875 1.875 0 0 0-3.75 0V9.5a1.875 1.875 0 0 0 3.75 0" />
      <path d="M5.375 6.75v2.5" />
    </Icon>
  );
}

/** Un reloj con una flecha que da la vuelta: el historial de actividad de una ficha. */
export function HistorialIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </Icon>
  );
}

export const SECTION_ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  Proveeduría: ProveeduriaIcon,
  Tiendas: TiendaIcon,
  "Gestión de Tiendas": GestionTiendasIcon,
  "Sistema WMS": WmsIcon,
  "Recursos Humanos": RecursosHumanosIcon,
};
