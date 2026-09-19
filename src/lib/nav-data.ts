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
    title: "General",
    items: [{ label: "Centro de notificaciones", href: "/notificaciones" }],
  },
  {
    title: "Catálogo",
    items: [{ label: "SKU maestro", href: "/catalogo-maestro" }],
  },
  {
    title: "Recursos Humanos",
    items: [
      { label: "Contrataciones", pronto: true },
      { label: "Usuarios y roles", href: "/usuarios" },
    ],
  },
];

/** Módulos de Dropi, la única plataforma de proveeduría con datos reales por ahora. */
const MODULOS_DROPI: NavItem[] = [
  { label: "Pedidos Dropi", href: "/pedidos-dropi" },
  { label: "Inventario", href: "/inventario" },
  { label: "Alertas de inventario", href: "/alertas" },
  { label: "Extractos bancarios", href: "/extractos" },
  { label: "Productos y márgenes", href: "/productos" },
  { label: "Conciliación de Retiros", href: "/retiros" },
  { label: "Nómina y gastos", href: "/gastos" },
  { label: "CRM Dropshippers", href: "/crm-dropshippers" },
  { label: "Inteligencia competitiva", href: "/inteligencia-competitiva" },
];

export interface NavGroup {
  label: string;
  pronto: boolean;
  items: NavItem[];
}

export interface NavSectionAnidada {
  title: string;
  groups: NavGroup[];
}

/** Agrupa las plataformas de un país en las secciones "Proveeduría" y "Tiendas" del sidebar. */
export function construirSeccionesPlataforma(
  plataformasPais: { nombre: string; tipoOperacion: "proveeduria" | "tienda"; tieneDatos: boolean }[]
): NavSectionAnidada[] {
  const aGrupo = (p: (typeof plataformasPais)[number]): NavGroup => ({
    label: p.nombre,
    pronto: !p.tieneDatos,
    items: p.tieneDatos && p.nombre === "Dropi" ? MODULOS_DROPI : [],
  });

  const secciones: NavSectionAnidada[] = [];
  const proveeduria = plataformasPais.filter((p) => p.tipoOperacion === "proveeduria").map(aGrupo);
  if (proveeduria.length > 0) secciones.push({ title: "Proveeduría", groups: proveeduria });

  const tiendas = plataformasPais.filter((p) => p.tipoOperacion === "tienda").map(aGrupo);
  if (tiendas.length > 0) secciones.push({ title: "Tiendas", groups: tiendas });

  return secciones;
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
 * Sección (y, si aplica, grupo de plataforma) que contiene la ruta actual —
 * para que el sidebar abra automáticamente lo que corresponde al entrar por
 * una URL directa o recargar la página, en vez de siempre abrir la primera.
 */
export function encontrarSeccionActiva(
  pathname: string,
  seccionesPlataforma: NavSectionAnidada[],
  navSections: NavSection[]
): { seccionTitle: string; grupoLabel: string | null } | null {
  for (const seccion of seccionesPlataforma) {
    for (const grupo of seccion.groups) {
      if (grupo.items.some((item) => item.href === pathname)) {
        return { seccionTitle: seccion.title, grupoLabel: grupo.label };
      }
    }
  }
  for (const seccion of navSections) {
    if (seccion.items.some((item) => item.href === pathname)) {
      return { seccionTitle: seccion.title, grupoLabel: null };
    }
  }
  return null;
}
