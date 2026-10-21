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

/** Carrito de compras: el módulo "Compras" (distinto de la bolsa de "Gestión de Tiendas"). */
export function ComprasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.2a2 2 0 0 0 2-1.6L20.5 8H6" />
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

/** Envío (camión, como «truck» de Lucide). */
export function EnvioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
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

export function CopiarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
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

/** Un tubo de ensayo: el módulo de Productos Test. */
export function TestIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v6.5L5.5 17a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L14 9.5V3" />
      <path d="M7.5 14h9" />
    </Icon>
  );
}

/*
 * Íconos del riel del menú: los mismos de Mi Reto Digital (Lucide, trazo de 1,75) para que los dos sistemas se vean
 * iguales al integrarlos.
 */
function IconoLucide({ children, relleno, ...props }: SVGProps<SVGSVGElement> & { relleno?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={relleno ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Barras: Desempeño. */
export function DesempenoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </IconoLucide>
  );
}

/** Estrella llena: Favoritos. */
export function FavoritosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide relleno {...props}>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </IconoLucide>
  );
}

/** Matraz: Testing Lab (de dónde salen los productos hasta el resultado de su test). */
export function TestingLabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
      <path d="M6.453 15h11.094" />
      <path d="M8.5 2h7" />
    </IconoLucide>
  );
}

/** Megáfono: Marketing y ventas. */
export function MarketingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
      <path d="M8 6v8" />
    </IconoLucide>
  );
}

/** Apretón de manos: Clientes (los dropshippers y, después, los clientes de las tiendas). */
export function ClientesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2" />
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </IconoLucide>
  );
}

/** Microscopio: Investigación (inteligencia competitiva). */
export function InvestigacionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </IconoLucide>
  );
}

/** Portapapeles con lista: Operación. */
export function OperacionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </IconoLucide>
  );
}

/** Edificio con columnas: Finanzas. */
export function FinanzasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M10 18v-7" />
      <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
    </IconoLucide>
  );
}

/** Personas: Equipo. */
export function EquipoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
    </IconoLucide>
  );
}

/** Campana: Avisos. */
export function AvisosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </IconoLucide>
  );
}

/** Engranaje: Ajustes. */
export function AjustesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </IconoLucide>
  );
}

/** Círculo con signo de pregunta: el Centro de ayuda (glosario, guías, universidad y manuales). */
export function AyudaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </IconoLucide>
  );
}

/** Birrete: la Universidad del sistema (cursos por módulo). */
export function UniversidadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </IconoLucide>
  );
}

/** Cabeza de orejas largas y ojos grandes: Baby Yoda, el cerebro de la operación (próximamente). */
export function BabyYodaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M6.8 12c0-3.4 2.3-5.6 5.2-5.6s5.2 2.2 5.2 5.6c0 3.3-2.3 5.4-5.2 5.4S6.8 15.3 6.8 12z" />
      <path d="M7 10.4 1 9.6c.8 2.3 2.9 3.9 6.2 4.1" />
      <path d="m17 10.4 6-.8c-.8 2.3-2.9 3.9-6.2 4.1" />
      <circle cx="9.7" cy="12.2" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.3" cy="12.2" r="1.2" fill="currentColor" stroke="none" />
      <path d="M11.2 15c.5.4 1.1.4 1.6 0" />
      <path d="M7.5 20.5c1.2-1.2 2.7-1.9 4.5-1.9s3.3.7 4.5 1.9" />
    </IconoLucide>
  );
}

export const SECTION_ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  Desempeño: DesempenoIcon,
  Favoritos: FavoritosIcon,
  "Testing Lab": TestingLabIcon,
  Marketing: MarketingIcon,
  Clientes: ClientesIcon,
  Investigación: InvestigacionIcon,
  Operación: OperacionIcon,
  Finanzas: FinanzasIcon,
  Equipo: EquipoIcon,
};

/** Sol: «Hoy», la pantalla de inicio. */
export function HoyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </IconoLucide>
  );
}

/** Mira: Drop Killer (cazar productos en tendencia). */
export function DropKillerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M22 12h-4" />
      <path d="M6 12H2" />
      <path d="M12 6V2" />
      <path d="M12 22v-4" />
    </IconoLucide>
  );
}

/** Trofeo: Tu Winner (productos ganadores). */
export function TuWinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </IconoLucide>
  );
}

/** Marco de escaneo con lupa: Scraping de proveedores. */
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </IconoLucide>
  );
}

/** La «f» de Facebook. */
export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </IconoLucide>
  );
}

/** La nota musical de TikTok. */
export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </IconoLucide>
  );
}

/** El ícono de la red de una captura (Instagram, Facebook o TikTok): cada una lleva el suyo, no el de Instagram para todas. */
export function iconoDeRed(plataforma: string): (props: SVGProps<SVGSVGElement>) => React.JSX.Element {
  return plataforma === "facebook" ? FacebookIcon : plataforma === "tiktok" ? TikTokIcon : InstagramIcon;
}

/** Dos productos frente a frente: Análisis de competencia. */
export function AnalisisCompetenciaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="7" height="14" rx="1.5" />
      <rect x="14" y="5" width="7" height="14" rx="1.5" />
      <path d="M10 12h4" />
    </Icon>
  );
}

export function ScrapingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
      <path d="m16 16-1.9-1.9" />
    </IconoLucide>
  );
}

/** Lista con marcas: Selección de productos. */
export function SeleccionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </IconoLucide>
  );
}

/** Destellos: Creación de ofertas (la oferta se arma con IA). */
export function OfertaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </IconoLucide>
  );
}

/** Ventana de navegador con su portada: Generador de landings. */
export function LandingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 6h.01" />
      <path d="M10 6h.01" />
      <path d="M7 13h10" />
      <path d="M7 17h6" />
    </IconoLucide>
  );
}

/** Etiqueta de precio sobre una caja: Gestión de publicaciones Dropi (lo que ofrecemos en Dropi). */
export function PublicacionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </IconoLucide>
  );
}

/** Almacén con estantes: Bodegas. */
export function BodegaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
      <path d="M6 18h12" />
      <path d="M6 14h12" />
      <rect width="12" height="12" x="6" y="10" />
    </IconoLucide>
  );
}

/** Pin de mapa: Ubicaciones (bins de una bodega). */
export function UbicacionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </IconoLucide>
  );
}

/** Tendencia al alza: Productos y márgenes. */
export function MargenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
      <path d="M16 7h6v6" />
    </IconoLucide>
  );
}

/** Persona con engranaje: Usuarios y roles. */
export function PuestosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      <path d="M12 12V8" />
    </IconoLucide>
  );
}

export function UsuariosIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <circle cx="18" cy="15" r="3" />
      <circle cx="9" cy="7" r="4" />
      <path d="M10 15H6a4 4 0 0 0-4 4v2" />
      <path d="m21.7 16.4-.9-.3" />
      <path d="m15.2 13.9-.9-.3" />
      <path d="m16.6 18.7.3-.9" />
      <path d="m19.1 12.2.3-.9" />
      <path d="m19.6 18.7-.4-1" />
      <path d="m16.8 12.3-.4-1" />
      <path d="m14.3 16.6 1-.4" />
      <path d="m20.7 13.8 1-.4" />
    </IconoLucide>
  );
}

/** Corazón en un globo de diálogo: Sugerencias de clientes (lo que un dropshipper nos recomienda). */
export function SugerenciaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconoLucide {...props}>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314 1 1 0 0 0 .783-.004 1.14 1.14 0 0 0 .398-.31l3.008-3.264A2.77 2.77 0 0 0 16.5 9.5 2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5" />
    </IconoLucide>
  );
}

/**
 * El ícono de cada página del menú, por su ruta. Va aparte de `AREAS` (nav-data) porque el menú viaja del servidor al
 * navegador como datos y un componente no se puede enviar así. Una página nueva del menú suma aquí su ícono.
 */
export const ICONOS_PAGINA: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  "/": HoyIcon,
  "/drop-killer": DropKillerIcon,
  "/tu-winner": TuWinnerIcon,
  "/scraping-proveedores": ScrapingIcon,
  "/instagram": InstagramIcon,
  "/sugerencias-clientes": SugerenciaIcon,
  "/seleccion-productos": SeleccionIcon,
  "/creacion-ofertas": OfertaIcon,
  "/generador-landings": LandingIcon,
  "/publicaciones-dropi": PublicacionIcon,
  "/productos-test": TestIcon,
  "/filtro-productos": FiltroIcon,
  "/crm-dropshippers": DropshipperIcon,
  "/inteligencia-competitiva": InteligenciaIcon,
  "/analisis-competencia": AnalisisCompetenciaIcon,
  "/pedidos-dropi": PedidoIcon,
  "/alertas": AlertaIcon,
  "/inventario": InventarioIcon,
  "/wms-bodegas": BodegaIcon,
  "/wms-ubicaciones": UbicacionIcon,
  "/compras": ComprasIcon,
  "/producto": ProductoIcon,
  "/retiros": ConciliacionIcon,
  "/extractos": ExtractoIcon,
  "/gastos": GastoIcon,
  "/productos": MargenIcon,
  "/usuarios": UsuariosIcon,
  "/puestos": PuestosIcon,
  "/wms-productos": TiendaIcon,
  "/wms-productos-dropi": CatalogoIcon,
  "/notificaciones": NotificacionesIcon,
};

export function OjoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function OjoTachadoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.7C3.8 8.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Icon>
  );
}

export function CandadoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

/** Los controles deslizantes: «Afinar» lo que ve un rol o una persona dentro de un módulo. */
export function AfinarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Icon>
  );
}

export function EscudoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </Icon>
  );
}

export function ReiniciarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 8-8" />
      <path d="M4 4v5h5" />
    </Icon>
  );
}

export function PestanasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M9 5v5" />
    </Icon>
  );
}

export function RayoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
    </Icon>
  );
}

export function ListaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Icon>
  );
}

export function EmbudoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </Icon>
  );
}

export function MundoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </Icon>
  );
}
