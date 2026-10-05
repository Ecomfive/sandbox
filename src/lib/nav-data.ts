/** Los tres frentes del negocio: cada área del menú se reparte entre ellos. */
export type FrenteId = "proveeduria" | "tienda" | "fulfillment";

export const FRENTES: { id: FrenteId; titulo: string }[] = [
  { id: "proveeduria", titulo: "Proveeduría" },
  { id: "tienda", titulo: "Gestión de tienda" },
  { id: "fulfillment", titulo: "Fulfillment" },
];

export interface NavItem {
  label: string;
  href?: string;
  /** Solo se ofrece cuando la plataforma Dropi tiene datos en el país elegido. */
  dropi?: boolean;
  /** El frente al que pertenece. Sin frente la página va «afuera» de los tres (es de toda la empresa). */
  frente?: FrenteId;
}

/** Un área del menú (un botón del riel) con las páginas que se abren desde ella. */
export interface NavSection {
  title: string;
  /** El título del panel, si es más descriptivo que el del riel («Marketing y ventas» para «Marketing»). */
  panel?: string;
  /** El panel muestra los tres frentes (Proveeduría, Gestión de tienda y Fulfillment); el que no tiene páginas dice «Próximamente». */
  frentes?: boolean;
  /** No sale en el riel ni en el panel (tiene su propio acceso, como «Avisos»), pero cuenta para migas, buscador y fijados. */
  oculta?: boolean;
  items: NavItem[];
}

/**
 * Las áreas del menú, agrupadas por el trabajo que se hace en ellas (y no por la plataforma de donde vienen los datos:
 * el país y la plataforma son el contexto de la barra de arriba). Cada área se reparte en tres frentes: Proveeduría (lo
 * de Ecomfive hoy), Gestión de tienda (Mi Reto Digital, cuando se importe) y Fulfillment. Una página con `dropi` solo
 * aparece si Dropi tiene datos en el país elegido, igual que antes con el grupo «Dropi».
 *
 * Bodegas, ubicaciones, inventario y producto (catálogo y fichas) son de **Fulfillment**: el producto entra por el WMS y sale
 * o bien por Proveeduría (dropshippers) o bien por Fulfillment hacia tiendas, sean de un tercero a quien solo se le presta el
 * servicio (Clicksy) o propias (Kenku, Nuvo, Wao Ofertas y Ofertfy). Están en Operación y no en Marketing: aquí los productos
 * se importan y se compran (bajo dropshipping, en cambio, el catálogo sí es parte de vender).
 */
const AREAS: NavSection[] = [
  {
    title: "Desempeño",
    frentes: true,
    items: [{ label: "Hoy", href: "/", frente: "proveeduria" }],
  },
  {
    title: "Marketing",
    panel: "Marketing y ventas",
    frentes: true,
    items: [
      { label: "CRM Dropshippers", href: "/crm-dropshippers", dropi: true, frente: "proveeduria" },
      { label: "Inteligencia competitiva", href: "/inteligencia-competitiva", dropi: true, frente: "proveeduria" },
      { label: "Productos Test", href: "/productos-test", frente: "proveeduria" },
    ],
  },
  {
    title: "Operación",
    panel: "Operaciones",
    frentes: true,
    items: [
      { label: "Pedidos Dropi", href: "/pedidos-dropi", dropi: true, frente: "proveeduria" },
      { label: "Alertas de inventario", href: "/alertas", dropi: true, frente: "fulfillment" },
      { label: "Inventario", href: "/inventario", dropi: true, frente: "fulfillment" },
      { label: "Bodegas", href: "/wms-bodegas", frente: "fulfillment" },
      { label: "Ubicaciones", href: "/wms-ubicaciones", frente: "fulfillment" },
      { label: "Compras", href: "/compras", frente: "fulfillment" },
      { label: "Catálogo maestro", href: "/catalogo-maestro", frente: "fulfillment" },
      { label: "Ficha producto Shopify", href: "/wms-productos", frente: "fulfillment" },
      { label: "Ficha producto Dropi", href: "/wms-productos-dropi", frente: "fulfillment" },
    ],
  },
  {
    title: "Finanzas",
    frentes: true,
    items: [
      { label: "Conciliación de Retiros", href: "/retiros", dropi: true, frente: "proveeduria" },
      { label: "Extractos bancarios", href: "/extractos", dropi: true, frente: "proveeduria" },
      { label: "Nómina y gastos", href: "/gastos", dropi: true, frente: "proveeduria" },
      { label: "Productos y márgenes", href: "/productos", dropi: true, frente: "proveeduria" },
    ],
  },
  {
    title: "Equipo",
    panel: "Recursos humanos",
    frentes: true,
    // Usuarios y roles es de toda la empresa: queda afuera de los tres frentes.
    items: [{ label: "Usuarios y roles", href: "/usuarios" }],
  },
  // Su acceso es el botón «Avisos» de abajo del riel (con el contador de pendientes).
  {
    title: "Avisos",
    oculta: true,
    items: [{ label: "Centro de notificaciones", href: "/notificaciones" }],
  },
];

/** Lo que todavía no se puede abrir: va aparte, en «Próximamente», para no ocupar lugar en el menú. */
export const PRONTO_NAV: string[] = ["Contrataciones"];

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
