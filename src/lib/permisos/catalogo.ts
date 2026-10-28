// Qué se puede dar o quitar en Usuarios y roles: los módulos agrupados por área (para la matriz de un rol) y, de los módulos que
// ya lo permiten, qué pestañas, acciones, campos y datos se pueden afinar. Lógica pura, sin base ni React.

export type Nivel = "n" | "r" | "w";

export interface ModuloAcceso {
  clave: string;
  etiqueta: string;
}

export interface AreaAcceso {
  id: string;
  nombre: string;
  /** El color de su punto en la matriz (solo decora: el nombre va al lado). */
  color: string;
  modulos: ModuloAcceso[];
}

/** Los módulos como se reparten en el menú, con el nombre corto que se ve en la matriz. Las claves son las de `src/lib/modulos.ts`. */
export const AREAS_ACCESO: AreaAcceso[] = [
  {
    id: "desempeno",
    nombre: "Desempeño",
    color: "#5f43d1",
    modulos: [
      { clave: "dashboard", etiqueta: "Hoy" },
      { clave: "ventas-dropi", etiqueta: "Ventas Dropi" },
      { clave: "notificaciones", etiqueta: "Centro de notificaciones" },
    ],
  },
  {
    id: "testing-lab",
    nombre: "Marketing y ventas · Testing Lab",
    color: "#c22f6a",
    modulos: [
      { clave: "drop-killer", etiqueta: "Drop Killer" },
      { clave: "tu-winner", etiqueta: "Tu Winner" },
      { clave: "scraping-proveedores", etiqueta: "Scraping de proveedores" },
      { clave: "instagram", etiqueta: "Instagram" },
      { clave: "sugerencias-clientes", etiqueta: "Sugerencias de clientes" },
      { clave: "seleccion-productos", etiqueta: "Selección de productos" },
      { clave: "creacion-ofertas", etiqueta: "Creación de ofertas" },
      { clave: "generador-landings", etiqueta: "Generador de landings" },
      { clave: "productos-test", etiqueta: "Test productos" },
      { clave: "filtro-productos", etiqueta: "Filtro de productos" },
    ],
  },
  {
    id: "clientes",
    nombre: "Clientes",
    color: "#0e7490",
    modulos: [
      { clave: "crm-dropshippers", etiqueta: "CRM Dropshippers" },
      { clave: "crm-comercial", etiqueta: "CRM: área comercial" },
      { clave: "crm-direccion", etiqueta: "CRM: dirección (CEO)" },
    ],
  },
  {
    id: "investigacion",
    nombre: "Investigación",
    color: "#9b2fa8",
    modulos: [
      { clave: "inteligencia-competitiva", etiqueta: "Inteligencia competitiva" },
      { clave: "analisis-competencia", etiqueta: "Análisis de competencia" },
    ],
  },
  {
    id: "operaciones",
    nombre: "Operaciones",
    color: "#b45309",
    modulos: [
      { clave: "pedidos-dropi", etiqueta: "Pedidos Dropi" },
      { clave: "alertas", etiqueta: "Alertas de inventario" },
      { clave: "inventario", etiqueta: "Inventario" },
      { clave: "wms-bodegas", etiqueta: "Bodegas" },
      { clave: "wms-ubicaciones", etiqueta: "Ubicaciones" },
      { clave: "compras", etiqueta: "Compras" },
      { clave: "producto", etiqueta: "Producto" },
      { clave: "wms-productos", etiqueta: "Ficha producto Shopify" },
      { clave: "wms-productos-dropi", etiqueta: "Ficha producto Dropi" },
      { clave: "publicaciones-dropi", etiqueta: "Gestión de IDs Dropi" },
    ],
  },
  {
    id: "finanzas",
    nombre: "Finanzas",
    color: "#15803d",
    modulos: [
      { clave: "retiros", etiqueta: "Conciliación de Retiros" },
      { clave: "conciliaciones", etiqueta: "Conciliación" },
      { clave: "extractos", etiqueta: "Extractos bancarios" },
      { clave: "productos", etiqueta: "Productos y márgenes" },
      { clave: "gastos", etiqueta: "Nómina y gastos" },
    ],
  },
  {
    id: "equipo",
    nombre: "Equipo y sistema",
    color: "#1d4ed8",
    modulos: [
      { clave: "puestos", etiqueta: "Puestos y organigrama" },
      { clave: "rendimiento", etiqueta: "Rendimiento del equipo" },
      { clave: "usuarios", etiqueta: "Usuarios y roles" },
      { clave: "configuracion", etiqueta: "Configuración del sistema" },
    ],
  },
];

/** Todos los módulos de la matriz, en el orden en que se ven. */
export const MODULOS_ACCESO: ModuloAcceso[] = AREAS_ACCESO.flatMap((a) => a.modulos);

export const etiquetaDeModulo = (clave: string): string => MODULOS_ACCESO.find((m) => m.clave === clave)?.etiqueta ?? clave;

/** Los módulos con datos sensibles (nómina, bancos, retiros, márgenes) y los que dan poder de administración: llevan su marca en la matriz. */
export const MODULOS_SENSIBLES: ReadonlySet<string> = new Set(["retiros", "conciliaciones", "extractos", "productos", "gastos", "usuarios", "configuracion", "rendimiento"]);

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se puede afinar dentro de un módulo
// ---------------------------------------------------------------------------------------------------------------------

export interface PestanaCatalogo {
  clave: string;
  etiqueta: string;
  /** La página de esa pestaña, para esconderla de la franja de pestañas y de la paleta de búsqueda. */
  href: string;
}

export interface AccionCatalogo {
  clave: string;
  etiqueta: string;
  /** Solo la puede usar quien edita el módulo (con solo lectura, aunque esté permitida, no se ofrece). */
  requiereEdicion: boolean;
}

export interface CampoCatalogo {
  clave: string;
  etiqueta: string;
  /** Falso en un dato que calcula el sistema: solo se puede ver u ocultar, nunca editar. */
  editable: boolean;
  /** Falso en un dato sin el cual el módulo no funciona (la etapa agrupa y manda lo atrasado): se puede ver o editar, no ocultar. */
  ocultable: boolean;
}

export interface GrupoCampos {
  nombre: string;
  /** Datos de dinero u otros que conviene cuidar: el grupo lleva su marca. */
  sensible: boolean;
  campos: CampoCatalogo[];
}

export interface AlcanceCatalogo {
  titulo: string;
  /** La primera opción es la que no limita nada. */
  opciones: { valor: string; etiqueta: string }[];
}

export interface CatalogoModulo {
  modulo: string;
  etiqueta: string;
  pestanas: PestanaCatalogo[];
  acciones: AccionCatalogo[];
  grupos: GrupoCampos[];
  alcance?: AlcanceCatalogo;
  /**
   * Pestañas que calculan sus cifras con ciertos campos: si esos campos se ocultan y la pestaña sigue visible, sus números saldrían
   * en cero. La pantalla de afinar lo avisa y ofrece ocultar esas pestañas.
   */
  cifrasPorPestana?: { pestanas: string[]; campos: string[] };
}

/** Compras es el primer módulo que lo aplica de punta a punta (pestañas, acciones, campos y alcance). */
export const CATALOGO_COMPRAS: CatalogoModulo = {
  modulo: "compras",
  etiqueta: "Compras",
  pestanas: [
    { clave: "lista", etiqueta: "Compras", href: "/compras/lista" },
    { clave: "tablero-chin", etiqueta: "Tablero de Shen Zhen", href: "/compras/tablero-chin" },
    { clave: "informe", etiqueta: "Informe", href: "/compras/informe" },
    { clave: "dashboard", etiqueta: "Dashboard", href: "/compras/dashboard" },
    { clave: "tiempos", etiqueta: "Tiempos y fallas", href: "/compras/tiempos" },
    { clave: "planificacion", etiqueta: "Planificación", href: "/compras/planificacion" },
    { clave: "envios", etiqueta: "Envíos", href: "/compras/envios" },
    { clave: "sin-stock", etiqueta: "Sin stock", href: "/compras/sin-stock" },
  ],
  acciones: [
    { clave: "crear", etiqueta: "Crear compra", requiereEdicion: true },
    { clave: "lote", etiqueta: "Cambiar varias a la vez", requiereEdicion: true },
    { clave: "anular", etiqueta: "Anular y restaurar", requiereEdicion: true },
    { clave: "descargar", etiqueta: "Descargar la lista", requiereEdicion: false },
    { clave: "cotizacion", etiqueta: "Copiar cotización", requiereEdicion: false },
    { clave: "comentar", etiqueta: "Comentar y adjuntar archivos", requiereEdicion: true },
  ],
  grupos: [
    {
      nombre: "Dinero",
      sensible: true,
      campos: [
        { clave: "monto", etiqueta: "Monto total", editable: true, ocultable: true },
        { clave: "pago1", etiqueta: "Primer pago", editable: true, ocultable: true },
        { clave: "pago2", etiqueta: "Segundo pago", editable: true, ocultable: true },
        { clave: "pagado", etiqueta: "Pagado a proveedor", editable: true, ocultable: true },
        { clave: "unitario", etiqueta: "Valor unitario", editable: false, ocultable: true },
      ],
    },
    {
      nombre: "Proveedor y envío",
      sensible: false,
      campos: [
        { clave: "proveedor", etiqueta: "Proveedor", editable: true, ocultable: true },
        { clave: "agente", etiqueta: "Agente de envío", editable: true, ocultable: true },
        { clave: "via", etiqueta: "Vía de envío", editable: true, ocultable: true },
        { clave: "tienda", etiqueta: "Tienda", editable: true, ocultable: true },
      ],
    },
    {
      nombre: "Gestión",
      sensible: false,
      campos: [
        { clave: "etapa", etiqueta: "Etapa", editable: true, ocultable: false },
        { clave: "estado", etiqueta: "Estado", editable: true, ocultable: false },
        { clave: "etiquetas", etiqueta: "Etiquetas", editable: true, ocultable: true },
        { clave: "limite", etiqueta: "Fecha límite", editable: true, ocultable: true },
      ],
    },
  ],
  cifrasPorPestana: { pestanas: ["informe", "dashboard", "planificacion", "tiempos"], campos: ["monto", "pago1", "pago2", "pagado"] },
  alcance: {
    titulo: "Qué compras ve",
    opciones: [
      { valor: "todas", etiqueta: "Todas las compras" },
      { valor: "asignadas", etiqueta: "Solo las que tiene asignadas" },
      { valor: "creadas", etiqueta: "Solo las que creó" },
    ],
  },
};

const CATALOGOS: Record<string, CatalogoModulo> = { compras: CATALOGO_COMPRAS };

/** El catálogo de lo afinable de un módulo, o `undefined` si ese módulo todavía solo se da o se quita completo. */
export const catalogoDe = (modulo: string): CatalogoModulo | undefined => CATALOGOS[modulo];

/** Las claves de los módulos que ya se pueden afinar. */
export const MODULOS_AFINABLES: string[] = Object.keys(CATALOGOS);
