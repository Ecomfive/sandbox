export interface NavItem {
  label: string;
  href?: string;
  /** Solo se ofrece cuando la plataforma Dropi tiene datos en el país elegido. */
  dropi?: boolean;
}

/** Un área del menú (un botón del riel) con las páginas que se abren desde ella. */
export interface NavSection {
  title: string;
  /** Nombre corto bajo el ícono del riel, si el título no cabe («Clientes» para «Dropshippers»). */
  corto?: string;
  items: NavItem[];
}

/**
 * Las áreas del menú, agrupadas por el trabajo que se hace en ellas (y no por la plataforma de donde vienen los datos:
 * el país y la plataforma son el contexto de la barra de arriba). Una página con `dropi` solo aparece si Dropi tiene
 * datos en el país elegido, igual que antes con el grupo «Dropi».
 */
const AREAS: NavSection[] = [
  {
    title: "Inicio",
    items: [
      { label: "Hoy", href: "/" },
      { label: "Centro de notificaciones", href: "/notificaciones" },
    ],
  },
  {
    title: "Operación",
    items: [
      { label: "Pedidos Dropi", href: "/pedidos-dropi", dropi: true },
      { label: "Alertas de inventario", href: "/alertas", dropi: true },
      { label: "Inventario", href: "/inventario", dropi: true },
      { label: "Bodegas", href: "/wms-bodegas" },
      { label: "Ubicaciones", href: "/wms-ubicaciones" },
    ],
  },
  {
    title: "Producto",
    items: [
      { label: "Productos Test", href: "/productos-test" },
      { label: "Compras", href: "/compras" },
      { label: "Catálogo maestro", href: "/catalogo-maestro" },
      { label: "Ficha producto Shopify", href: "/wms-productos" },
      { label: "Ficha producto Dropi", href: "/wms-productos-dropi" },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { label: "Conciliación de Retiros", href: "/retiros", dropi: true },
      { label: "Extractos bancarios", href: "/extractos", dropi: true },
      { label: "Nómina y gastos", href: "/gastos", dropi: true },
      { label: "Productos y márgenes", href: "/productos", dropi: true },
    ],
  },
  {
    title: "Dropshippers",
    corto: "Clientes",
    items: [{ label: "CRM Dropshippers", href: "/crm-dropshippers", dropi: true }],
  },
  {
    title: "Mercado",
    items: [{ label: "Inteligencia competitiva", href: "/inteligencia-competitiva", dropi: true }],
  },
  {
    title: "Equipo",
    items: [{ label: "Usuarios y roles", href: "/usuarios" }],
  },
];

/** Lo que todavía no se puede abrir: va aparte, en «Próximamente», para no ocupar lugar en el menú. */
export const PRONTO_NAV: string[] = ["Gestión de Tiendas", "Contrataciones"];

/** Las áreas del menú para un país: sin las páginas de Dropi si Dropi no tiene datos allí, y sin áreas vacías. */
export function construirAreas(plataformasPais: { nombre: string; tieneDatos: boolean }[]): NavSection[] {
  const hayDropi = plataformasPais.some((p) => p.nombre === "Dropi" && p.tieneDatos);
  return AREAS.map((area) => ({ ...area, items: area.items.filter((item) => !item.dropi || hayDropi) })).filter(
    (area) => area.items.length > 0
  );
}

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

/**
 * El área que contiene la ruta actual (para que el menú abra la que corresponde al entrar por una URL directa o
 * recargar). Cuenta una subpágina o un detalle: `/retiros/cuentas` y `/retiros/12` son del área de `/retiros`; si dos
 * páginas coinciden, gana la de ruta más larga.
 */
export function encontrarSeccionActiva(pathname: string, areas: NavSection[]): string | null {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let mejor: { titulo: string; largo: number } | null = null;
  for (const area of areas) {
    for (const item of area.items) {
      if (!item.href) continue;
      const coincide = item.href === ruta || (item.href !== "/" && ruta.startsWith(`${item.href}/`));
      if (coincide && (!mejor || item.href.length > mejor.largo)) mejor = { titulo: area.title, largo: item.href.length };
    }
  }
  return mejor?.titulo ?? null;
}
