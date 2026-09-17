export interface NavItem {
  label: string;
  href?: string;
  pronto?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operaciones",
    items: [
      { label: "Inventario", href: "/inventario" },
      { label: "Alertas de inventario", href: "/alertas" },
      { label: "Pedidos Dropi", href: "/pedidos-dropi" },
      { label: "Logística", pronto: true },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { label: "Extractos bancarios", href: "/extractos" },
      { label: "Conciliación", href: "/conciliaciones" },
      { label: "Productos y márgenes", href: "/productos" },
      { label: "Retiros (Wallet)", href: "/retiros" },
      { label: "Nómina y gastos", href: "/gastos" },
    ],
  },
  {
    title: "Inteligencia competitiva",
    items: [{ label: "Proveedores Dropi", href: "/inteligencia-competitiva" }],
  },
  {
    title: "CRM Dropshippers",
    items: [{ label: "Panel de dropshippers", href: "/crm-dropshippers" }],
  },
  {
    title: "Configuración",
    items: [
      { label: "Tiendas Shopify", pronto: true },
      { label: "Usuarios y roles", href: "/usuarios" },
    ],
  },
];

export interface PaisNav {
  codigo: string;
  nombre: string;
  pronto?: boolean;
}

export const PAISES_NAV: PaisNav[] = [
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "MX", nombre: "México", pronto: true },
  { codigo: "HN", nombre: "Honduras", pronto: true },
  { codigo: "VE", nombre: "Venezuela", pronto: true },
];

export const PAIS_COOKIE = "pais_actual";
export const PAIS_DEFAULT = "CR";

/** Clave de módulo (permisos) correspondiente a un href de navegación. */
export function moduloDeHref(href: string): string {
  return href === "/" ? "dashboard" : href.slice(1);
}
