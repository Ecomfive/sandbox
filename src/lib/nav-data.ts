import { GESTION_IDS, gestionesDePais, type PlataformaId } from "./plataformas";

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
  /** Otras rutas que también son esta página (la entrada única de «Gestión de IDs» cubre las tres plataformas): el menú la marca activa en cualquiera de ellas. */
  rutas?: string[];
  /** Solo se ofrece cuando la plataforma Dropi tiene datos en el país elegido. */
  dropi?: boolean;
  /** El frente al que pertenece. Sin frente la página va «afuera» de los tres (es de toda la empresa). */
  frente?: FrenteId;
  /** Cómo se ve el nombre en el menú lateral cuando no cabe en una línea: cada texto va en su propia línea. El nombre completo
   * (`label`) sigue en las migas, el buscador y los favoritos. */
  lineasMenu?: [string, string];
  /** Un grupo con título dentro del frente (Testing Lab: Fuentes, Selección, Producción, Resultados) o, en un área sin
   * frentes, dentro del área (Finanzas: Dirección, Tesorería…). Los grupos salen en el orden en que aparecen sus páginas;
   * las páginas sin grupo van primero, sin título. */
  grupo?: string;
}

/** Un área del menú (un botón del riel) con las páginas que se abren desde ella. */
export interface NavSection {
  title: string;
  /** El título del panel, si es más descriptivo que el del riel («Marketing y ventas» para «Marketing»). */
  panel?: string;
  /** El panel muestra los tres frentes (Proveeduría, Gestión de tienda y Fulfillment); el que no tiene páginas dice «Próximamente». */
  frentes?: boolean;
  /** Solo estos frentes, en vez de los tres (Testing Lab es solo de Proveeduría). */
  soloFrentes?: FrenteId[];
  /** Se queda en el riel aunque todavía no tenga páginas (Marketing): sus frentes dicen «Próximamente». */
  mostrarVacia?: boolean;
  /** No sale en el riel ni en el panel (tiene su propio acceso, como «Avisos»), pero cuenta para migas, buscador y favoritos. */
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
    items: [
      { label: "Hoy", href: "/", frente: "proveeduria" },
      { label: "Ventas Proveeduría", href: "/ventas-dropi", dropi: true, frente: "proveeduria" },
      { label: "Dashboard de tienda", href: "/tienda-dashboard", frente: "tienda" },
    ],
  },
  // El recorrido de un producto antes de comprarse, en orden: de dónde sale (Fuentes), qué se elige (Selección), cómo se
  // prepara su oferta (Producción) y cómo le fue (Resultados). Solo es de Proveeduría.
  {
    title: "Testing Lab",
    frentes: true,
    soloFrentes: ["proveeduria"],
    items: [
      { label: "Drop Killer", href: "/drop-killer", frente: "proveeduria", grupo: "Fuentes" },
      { label: "Tu Winner", href: "/tu-winner", frente: "proveeduria", grupo: "Fuentes" },
      { label: "Scraping de proveedores", href: "/scraping-proveedores", frente: "proveeduria", grupo: "Fuentes" },
      { label: "Instagram", href: "/instagram", frente: "proveeduria", grupo: "Fuentes" },
      { label: "Sugerencias de clientes", href: "/sugerencias-clientes", frente: "proveeduria", grupo: "Fuentes" },
      { label: "Selección de productos", href: "/seleccion-productos", frente: "proveeduria", grupo: "Selección" },
      { label: "Creación de ofertas", href: "/creacion-ofertas", frente: "proveeduria", grupo: "Producción" },
      { label: "Generador de landings", href: "/generador-landings", frente: "proveeduria", grupo: "Producción" },
      { label: "Test productos", href: "/productos-test", frente: "proveeduria", grupo: "Resultados" },
      { label: "Filtro de productos", href: "/filtro-productos", frente: "proveeduria", grupo: "Resultados" },
    ],
  },
  // Marketing se queda para lo que sea de marketing; por ahora sin páginas.
  {
    title: "Marketing",
    panel: "Marketing y ventas",
    frentes: true,
    mostrarVacia: true,
    items: [],
  },
  {
    title: "Clientes",
    frentes: true,
    items: [
      { label: "CRM Dropshippers", href: "/crm-dropshippers", dropi: true, frente: "proveeduria" },
      { label: "Bandeja de WhatsApp", href: "/crm-dropshippers/bandeja", frente: "proveeduria" },
    ],
  },
  {
    title: "Investigación",
    frentes: true,
    items: [
      { label: "Inteligencia competitiva", href: "/inteligencia-competitiva", dropi: true, frente: "proveeduria" },
      { label: "Análisis de competencia", href: "/analisis-competencia", frente: "proveeduria" },
    ],
  },
  {
    title: "Operación",
    panel: "Operaciones",
    frentes: true,
    items: [
      { label: "Pedidos Dropi", href: "/pedidos-dropi", dropi: true, frente: "proveeduria" },
      // Proveeduría (5 nov 2026, pedido de Alcides): son lo que publicamos como proveedor, junto a los pedidos que generan.
      { label: "Gestión de IDs Dropi", href: "/publicaciones-dropi", frente: "proveeduria" },
      { label: "Gestión de IDs Drop", href: "/publicaciones-drop", frente: "proveeduria" },
      { label: "Gestión de IDs Effi", href: "/publicaciones-effi", frente: "proveeduria" },
      // Gestión de tienda (3 nov 2026): las tiendas de Shopify (Kenku primero), conectadas solo de lectura.
      { label: "Pedidos de tienda", href: "/tienda-pedidos", frente: "tienda" },
      { label: "Productos de Shopify", href: "/tienda-productos", frente: "tienda" },
      { label: "Tiendas Shopify", href: "/tienda-tiendas", frente: "tienda" },
      // Lo operativo de Shopify (confirmar, despachar, efectivo contra entrega, conexión de tiendas) vive en Operación; lo
      // financiero (resumen, cuadre, importar) queda en Finanzas › Ventas por tienda. Mismo módulo de permisos.
      { label: "Pipeline de tiendas", href: "/ventas-tiendas/pipeline", frente: "tienda" },
      { label: "Órdenes de tiendas", href: "/ventas-tiendas/ordenes", frente: "tienda" },
      { label: "Alertas de inventario", href: "/alertas", dropi: true, frente: "fulfillment" },
      { label: "Inventario", href: "/inventario", dropi: true, frente: "fulfillment" },
      { label: "Bodegas", href: "/wms-bodegas", frente: "fulfillment" },
      { label: "Ubicaciones", href: "/wms-ubicaciones", frente: "fulfillment" },
      { label: "Compras", href: "/compras", frente: "fulfillment" },
      { label: "Producto", href: "/producto", frente: "fulfillment" },
      { label: "Deliverys", href: "/deliverys", frente: "fulfillment" },
    ],
  },
  // Finanzas es el Portal AF4 360°: es de toda la empresa (consolida las tiendas de los tres frentes), así que no se reparte
  // en frentes sino en grupos por función, en el orden en que se trabaja: dirigir, mover la caja, cerrar los números y
  // vender. Lo de la wallet de Dropi (proveeduría) va al final, en su grupo.
  {
    title: "Finanzas",
    panel: "Portal AF4 360°",
    items: [
      { label: "Panel financiero", href: "/panel-financiero", grupo: "Dirección" },
      { label: "Estado de resultados", href: "/estado-resultados", grupo: "Dirección" },
      { label: "Rentabilidad por tienda", href: "/rentabilidad", grupo: "Dirección" },
      { label: "Presupuesto", href: "/presupuesto", grupo: "Dirección" },
      { label: "Planificación", href: "/planificacion", grupo: "Dirección" },
      { label: "Distribución de utilidades", href: "/utilidades", grupo: "Dirección" },
      { label: "Capital y riesgo", href: "/capital-riesgo", grupo: "Dirección" },
      { label: "Tesorería", href: "/tesoreria", grupo: "Tesorería" },
      { label: "Flujo de caja", href: "/flujo-caja", grupo: "Tesorería" },
      { label: "Proyección de caja", href: "/proyeccion-caja", grupo: "Tesorería" },
      { label: "Conciliación bancaria", href: "/conciliacion-bancaria", grupo: "Tesorería" },
      { label: "Cuentas por cobrar", href: "/cuentas-por-cobrar", grupo: "Tesorería" },
      { label: "Cuentas por pagar", href: "/cuentas-por-pagar", grupo: "Tesorería" },
      { label: "Cierre de mes", href: "/cierre-mes", grupo: "Contabilidad y cierre" },
      { label: "Libro de movimientos", href: "/libro-movimientos", grupo: "Contabilidad y cierre" },
      { label: "Balance general", href: "/balance-general", grupo: "Contabilidad y cierre" },
      { label: "Costos de mercancía", href: "/costos-mercancia", grupo: "Contabilidad y cierre" },
      { label: "Bienes de uso", href: "/bienes-de-uso", grupo: "Contabilidad y cierre" },
      { label: "Ventas por tienda", href: "/ventas-tiendas", grupo: "Comercial" },
      { label: "Clientes y marketing", href: "/clientes-marketing", grupo: "Comercial" },
      { label: "Conciliación de Retiros", href: "/retiros", dropi: true, grupo: "Proveeduría Dropi" },
      { label: "Extractos bancarios", href: "/extractos", dropi: true, grupo: "Proveeduría Dropi" },
      { label: "Nómina y gastos", href: "/gastos", dropi: true, grupo: "Proveeduría Dropi" },
      { label: "Productos y márgenes", href: "/productos", dropi: true, grupo: "Proveeduría Dropi" },
    ],
  },
  {
    title: "Equipo",
    panel: "Recursos humanos",
    frentes: true,
    // Usuarios y roles y Puestos son de toda la empresa: quedan afuera de los tres frentes.
    items: [
      { label: "Usuarios y roles", href: "/usuarios" },
      { label: "Puestos", href: "/puestos" },
      { label: "Tareas", href: "/tareas" },
      { label: "Rendimiento", href: "/rendimiento" },
      { label: "Nómina", href: "/nomina" },
    ],
  },
  // Las fichas de producto de Shopify y de Dropi ya no están en el menú (se llega a ellas desde Producto); la página y su
  // permiso siguen vivos, y esta área oculta mantiene sus migas, el buscador y los favoritos.
  {
    title: "Fichas de canal",
    oculta: true,
    items: [
      { label: "Ficha producto Shopify", href: "/wms-productos" },
      { label: "Ficha producto Dropi", href: "/wms-productos-dropi" },
    ],
  },
  // Su acceso es el botón «Avisos» de abajo del riel (con el contador de pendientes).
  {
    title: "Avisos",
    oculta: true,
    items: [{ label: "Centro de notificaciones", href: "/notificaciones" }],
  },
];

/** Las páginas repartidas en sus grupos, en el orden en que aparece el primero de cada uno; las sin grupo van primero. */
export function agruparPaginas(items: NavItem[]): { grupo: string | null; items: NavItem[] }[] {
  const grupos: { grupo: string | null; items: NavItem[] }[] = [];
  const sinGrupo = items.filter((i) => !i.grupo);
  if (sinGrupo.length) grupos.push({ grupo: null, items: sinGrupo });
  for (const item of items) {
    if (!item.grupo) continue;
    const g = grupos.find((x) => x.grupo === item.grupo);
    if (g) g.items.push(item);
    else grupos.push({ grupo: item.grupo, items: [item] });
  }
  return grupos;
}

/** Lo que todavía no se puede abrir: va aparte, en «Próximamente», para no ocupar lugar en el menú. */
export const PRONTO_NAV: string[] = ["Contrataciones"];

/** Las áreas del menú para un país: sin las páginas de Dropi si Dropi no tiene datos allí, y sin áreas vacías. */
export function construirAreas(plataformasPais: { nombre: string; tieneDatos: boolean }[]): NavSection[] {
  const hayDropi = plataformasPais.some((p) => p.nombre === "Dropi" && p.tieneDatos);
  return AREAS.map((area) => ({ ...area, items: area.items.filter((item) => !item.dropi || hayDropi) })).filter(
    (area) => area.items.length > 0 || area.mostrarVacia
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
  // México abierto el 29 oct 2026 (Hernán): sus datos de Dropi ya están cargados.
  { codigo: "MX", nombre: "México" },
  // Honduras abierto el 31 oct 2026 (Alcides): empiezan las compras para Honduras.
  { codigo: "HN", nombre: "Honduras" },
  // Venezuela abierto el 31 oct 2026 (Alcides).
  { codigo: "VE", nombre: "Venezuela" },
];

export const PAIS_COOKIE = "pais_actual";
export const PAIS_DEFAULT = "CR";

/**
 * La primera página del menú que una persona puede abrir (en el orden del menú), para llevarla ahí cuando entra a una que no es
 * suya: no se le dice «sin acceso», simplemente cae en lo suyo. `excluirModulo` evita volver al módulo que acaba de rechazarla
 * (por ejemplo, cuando su rol le oculta todas las pestañas). `null` = no tiene ningún módulo.
 */
export function paginaInicialDe(modulos: readonly string[], excluirModulo?: string): string | null {
  for (const area of AREAS) {
    for (const item of area.items) {
      if (!item.href) continue;
      const modulo = moduloDeHref(item.href);
      if (modulo !== excluirModulo && modulos.includes(modulo)) return item.href;
    }
  }
  return null;
}

/** Clave de módulo (permisos) correspondiente a un href de navegación. */
export function moduloDeHref(href: string): string {
  return href === "/" ? "dashboard" : href.slice(1).split("/")[0];
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
      for (const h of [item.href, ...(item.rutas ?? [])]) {
        const coincide = h === ruta || (h !== "/" && ruta.startsWith(`${h}/`));
        if (coincide && (!mejor || h.length > mejor.largo)) mejor = { titulo: area.title, largo: h.length };
      }
    }
  }
  return mejor?.titulo ?? null;
}


/**
 * El menú con **una sola entrada «Gestión de IDs»** (6 nov 2026, pedido de Hernán): las de Dropi, Drop y Effi se juntan en una que lleva a la gestión de la plataforma elegida (la de la
 * barra de arriba) si la persona puede abrirla, o a la primera que pueda; el cambio entre ellas se hace con el selector de logos que sale arriba de cada gestión. Las migas, el buscador
 * y los favoritos siguen viendo las tres páginas: esto solo es para el menú lateral.
 */
export function colapsarGestionDeIds(areas: NavSection[], opciones: { plataforma: PlataformaId; codigoPais: string; modulos: readonly string[] | null }): NavSection[] {
  const rutas = Object.values(GESTION_IDS).map((g) => g.ruta);
  const disponibles = gestionesDePais(opciones.codigoPais, opciones.modulos);
  const elegida = disponibles.find((p) => p.id === opciones.plataforma) ?? disponibles[0];
  const href = GESTION_IDS[elegida?.id ?? "dropi"].ruta;
  return areas.map((area) => {
    const primero = area.items.findIndex((i) => i.href && rutas.includes(i.href));
    if (primero === -1) return area;
    const base = area.items[primero];
    const juntos: NavItem = { label: "Gestión de IDs", href, rutas, frente: base.frente };
    const items = area.items.filter((i) => !(i.href && rutas.includes(i.href)));
    items.splice(primero, 0, juntos);
    return { ...area, items };
  });
}
