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
      { label: "Pedidos Dropi", pronto: true },
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
      { label: "Nómina y gastos", pronto: true },
    ],
  },
  {
    title: "Inteligencia competitiva",
    items: [{ label: "Proveedores Dropi", pronto: true }],
  },
  {
    title: "CRM Dropshippers",
    items: [{ label: "Panel de dropshippers", pronto: true }],
  },
  {
    title: "Configuración",
    items: [
      { label: "Tiendas Shopify", pronto: true },
      { label: "Usuarios y roles", pronto: true },
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
