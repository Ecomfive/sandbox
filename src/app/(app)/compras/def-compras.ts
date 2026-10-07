import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaCompra {
  id: string;
  /** Número de orden de compra: correlativo único de todas las compras (OC-0123), aparte del código por país. */
  numero: number;
  /** Cuántos productos de la ficha tiene vinculados (las compras de ClickUp llegan sin ninguno y se vinculan a mano). */
  productos: number;
  /** Los productos vinculados, con lo pedido de cada uno. */
  lineas: { codigo: string; nombre: string; cantidad: number }[];
  /** 'pais' (compra nuestra de un país) o 'importacion' (Compras Importadora: servicio a un cliente, sin país). */
  tipo: string;
  /** Código del país de la compra (null en Importadora). */
  paisCodigo: string | null;
  /** El código de la compra (PA-00112, OM-0449…). */
  codigo: string | null;
  nombre: string;
  fotoUrl: string | null;
  etapa: string;
  estado: string;
  proveedor: string | null;
  cliente: string | null;
  tienda: string | null;
  trackId: string | null;
  orden: string | null;
  productoRelacionado: string | null;
  qtyTotal: number | null;
  montoTotal: number | null;
  primerPago: number | null;
  segundoPago: number | null;
  pagadoAProveedor: number | null;
  pagoPendiente: number | null;
  cobradoCliente: number | null;
  pendienteCliente: number | null;
  pagoCliente: string | null;
  cuentaReceptora: string | null;
  factura: boolean;
  financiamiento: boolean;
  fechaLimite: string | null;
  fechaLlegada: string | null;
  fechaPago1: string | null;
  fechaPago2: string | null;
  fechaEnvio: string | null;
  /**
   * El último comentario que empieza con «Inconveniente:» (sin ese título): una falla de la compra (aduana, retraso, error de
   * entrega…). Ya no es un campo: se marca comentando. De aquí salen las fallas del dashboard, el informe y Tiempos y fallas.
   */
  inconveniente: string | null;
  planificacion: string | null;
  documentos: string | null;
  asignadoNombre: string | null;
  /** Aire, mar o tierra (puede ser más de una). */
  viaEnvio: string[];
  prioridad: string | null;
  etiquetas: string[];
  creadorNombre: string | null;
  descripcion: string | null;
  urlProducto: string | null;
  paisesDestino: string[];
  fechaInicio: string | null;
  cerradoEn: string | null;
  creadoEn: string;
}

/** Los emojis de cada columna, tal como en ClickUp, para reconocerlas de un vistazo. */
export const EMOJI_CAMPO: Record<string, string> = {
  codigo: "🔖",
  pais: "🗺️",
  etapa: "👣",
  estado: "🚦",
  proveedor: "🏭",
  tienda: "🏪",
  cliente: "👤",
  viaEnvio: "🏗️",
  prioridad: "🚩",
  etiquetas: "🏷️",
  qtyTotal: "🧾",
  montoTotal: "💲",
  valorUnitario: "💲",
  primerPago: "⚠️",
  segundoPago: "⚠️",
  pagadoAProveedor: "💲",
  pagoPendiente: "❗",
  cobradoCliente: "💵",
  pendienteCliente: "⏳",
  pagoCliente: "💰",
  cuentaReceptora: "🏦",
  factura: "✅",
  financiamiento: "💰",
  fechaLimite: "⏰",
  fechaLlegada: "📦",
  fechaPago1: "📆",
  fechaPago2: "🗓️",
  fechaEnvio: "🚚",
  trackId: "🎫",
  orden: "🧾",
  planificacion: "🗓️",
  urlProducto: "🔗",
  documentos: "📎",
  foto: "📸",
  asignado: "🙋",
  creado: "🕒",
  cerrado: "🏁",
  dias: "⏱️",
};

/** «🏭 Proveedor»: el nombre de la columna con su emoji. */
export const conEmoji = (campo: string, nombre: string) => (EMOJI_CAMPO[campo] ? `${EMOJI_CAMPO[campo]} ${nombre}` : nombre);

/** Los montos de compras van en dólares en todos los países (así se pagan a los proveedores). */
export const MONEDA_COMPRAS = "PA";

/** Lo que se guarda (`valor`: aire, mar, tierra) no cambia nunca — la base lo restringe a esos tres y las compras ya
 * guardadas lo usan; solo cambia el texto que se ve (`etiqueta`). */
export const VIAS_ENVIO = [
  { valor: "aire", etiqueta: "🛩️ Aéreo" },
  { valor: "mar", etiqueta: "🚢 Marítimo" },
  { valor: "tierra", etiqueta: "🛻 Terrestre" },
] as const;
export const etiquetaVia = (v: string) => VIAS_ENVIO.find((x) => x.valor === v)?.etiqueta ?? v;

/** Las prioridades de ClickUp con sus colores (urgente rojo, alta amarillo, normal azul, baja gris). */
export const PRIORIDADES = [
  { valor: "urgente", etiqueta: "Urgente", color: "#F50000" },
  { valor: "alta", etiqueta: "Alta", color: "#F8AE00" },
  { valor: "normal", etiqueta: "Normal", color: "#6FDDFF" },
  { valor: "baja", etiqueta: "Baja", color: "#D8D8D8" },
] as const;
export const prioridadDe = (v: string | null) => PRIORIDADES.find((p) => p.valor === v) ?? null;

/** Días que lleva (o llevó, si ya cerró) una compra desde que se creó. */
export function diasDeCompra(c: Pick<FilaCompra, "creadoEn" | "cerradoEn">, ahora: number = Date.now()): number {
  const fin = c.cerradoEn ? Date.parse(c.cerradoEn) : ahora;
  return Math.max(0, Math.floor((fin - Date.parse(c.creadoEn)) / 86_400_000));
}

/** Las etapas del flujo de compra y financiamiento, calcadas de la lista de ClickUp «Compras Dropi PA
 * Panamá» (Espacio > Carpeta Compras > Lista PA): del backlog a completado o descartado. «Solicitud Local» se quitó
 * (6 oct 2026: ninguna compra estaba ahí y no se usaba desde marzo de 2025) y el resto se renumeró; solo cambian los
 * nombres que se ven, las claves guardadas son las mismas. */
export const ETAPAS_COMPRA = [
  { valor: "backlog", etiqueta: "Backlog - Pospuesto" },
  { valor: "solicitud_internacional", etiqueta: "01 - Solicitud Internacional" },
  { valor: "cotizar", etiqueta: "02 - Cotizar" },
  { valor: "cotizado", etiqueta: "03 - Cotizado" },
  { valor: "evaluacion_proveedor", etiqueta: "04 - Evaluación de Proveedor" },
  { valor: "solicitud_proveedor", etiqueta: "05 - Solicitud a Proveedor" },
  { valor: "compra_pago", etiqueta: "06 - Compra y Pago" },
  { valor: "produccion", etiqueta: "07 - En Producción" },
  { valor: "tracking", etiqueta: "08 - Tracking" },
  { valor: "aviso_logistica", etiqueta: "09 - Aviso Logística" },
  { valor: "arribo_mercancia", etiqueta: "10 - Arribo Mercancía" },
  { valor: "completado", etiqueta: "11 - Completado" },
  { valor: "descartado", etiqueta: "Descartado" },
] as const;

/** Los nombres de todas las etapas, también las que ya no se eligen (para leer la Actividad y los tiempos de antes). */
export const ETAPA_ETIQUETA: Record<string, string> = {
  ...Object.fromEntries(ETAPAS_COMPRA.map((e) => [e.valor, e.etiqueta])),
  solicitud_local: "Solicitud Local (ya no se usa)",
};

export const etiquetaEtapa = (valor: string) => ETAPA_ETIQUETA[valor] ?? valor;

/** Los mismos colores exactos que ClickUp le da a cada etapa en «Compras Dropi PA Panamá» (campo
 * personalizado «Etapa»), tomados de ahí para que la insignia se vea igual en nuestro sistema. */
const ETAPA_COLOR: Record<string, string> = {
  backlog: "#667684",
  solicitud_local: "#ffc500",
  solicitud_internacional: "#3082B7",
  cotizar: "#f9d900",
  cotizado: "#7C4DFF",
  evaluacion_proveedor: "#04A9F4",
  solicitud_proveedor: "#12cdd4",
  compra_pago: "#f9d900",
  produccion: "#3397dd",
  tracking: "#8ed401",
  aviso_logistica: "#FF7FAB",
  arribo_mercancia: "#EA80FC",
  completado: "#1bbc9c",
  descartado: "#e50000",
};

export const colorEtapa = (valor: string) => ETAPA_COLOR[valor] ?? "#8D8D8D";

/** El «Estado» de ClickUp: un semáforo aparte de la «Etapa», más simple — no sigue el mismo orden ni las
 * mismas 14 paradas, es la columna que estaba entre «Etapa» y «Proveedor» en la lista de ClickUp. */
export const ESTADOS_COMPRA = [
  { valor: "backlog", etiqueta: "Backlog" },
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "en_gestion", etiqueta: "En Gestión" },
  { valor: "hecho", etiqueta: "Hecho" },
  { valor: "en_revision", etiqueta: "En Revisión" },
  { valor: "aprobado", etiqueta: "Aprobado" },
  { valor: "rechazado", etiqueta: "Rechazado" },
  { valor: "completado", etiqueta: "Completado" },
] as const;

const ESTADO_ETIQUETA: Record<string, string> = Object.fromEntries(ESTADOS_COMPRA.map((e) => [e.valor, e.etiqueta]));

export const etiquetaEstado = (valor: string) => ESTADO_ETIQUETA[valor] ?? valor;

/** Los mismos colores exactos que ClickUp le da al «Estado» nativo de la tarea en «Compras Dropi PA
 * Panamá», leídos de su selector de estado para que la insignia se vea igual en nuestro sistema. */
const ESTADO_COLOR: Record<string, string> = {
  backlog: "#8D8D8D",
  pendiente: "#ED5F00",
  en_gestion: "#FFC53D",
  hecho: "#64C6A2",
  en_revision: "#ED5F00",
  aprobado: "#0880EA",
  rechazado: "#9C2BAD",
  completado: "#299764",
};

export const colorEstado = (valor: string) => ESTADO_COLOR[valor] ?? "#8D8D8D";

/** El ciclo termina en «Completado» o «Descartado»: como Cerrados en Retiros, se ocultan por defecto. */
const ETAPAS_CERRADAS = ["completado", "descartado"];

/** Precio por unidad: no se guarda (es una fórmula, como en ClickUp), se calcula al mostrarla. */
export const valorUnitario = (c: FilaCompra): number | null =>
  c.montoTotal !== null && c.qtyTotal ? c.montoTotal / c.qtyTotal : null;

/** «OC-0123»: el número de orden de compra como se muestra. */
export const numeroOC = (n: number) => `OC-${String(n).padStart(4, "0")}`;

/**
 * El título de una compra: con productos vinculados, su número de orden (los productos se ven debajo); sin ellos, el nombre
 * que traía de ClickUp (que decía el producto).
 */
export const tituloCompra = (c: Pick<FilaCompra, "numero" | "nombre" | "productos">) => (c.productos > 0 ? numeroOC(c.numero) : c.nombre);

/** «1.000 × Faja · Beige / S, 500 × Truly…» (hasta `max`, y «y N más»). */
export function resumenLineas(lineas: FilaCompra["lineas"], max = 3): string {
  const partes = lineas.slice(0, max).map((l) => `${l.cantidad.toLocaleString("es-PA")} × ${l.nombre || l.codigo}`);
  return lineas.length > max ? `${partes.join(", ")} y ${lineas.length - max} más` : partes.join(", ");
}

/** Cómo se filtra, agrupa y oculta lo cerrado en la tabla de Compras. */
export const DEF_COMPRAS: DefTabla<FilaCompra> = {
  clave: "compras",
  campos: [
    {
      id: "pais",
      etiqueta: "País",
      tipo: "seleccion",
      valores: (c) => [c.paisCodigo ?? SIN_VALOR],
      etiquetaSinValor: "Importadora",
      agrupable: true,
    },
    {
      id: "etapa",
      etiqueta: "Etapa",
      tipo: "seleccion",
      valores: (c) => [c.etapa],
      opciones: () => ETAPAS_COMPRA.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ETAPAS_COMPRA.map((e) => e.valor),
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (c) => [c.estado],
      opciones: () => ESTADOS_COMPRA.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_COMPRA.map((e) => e.valor),
    },
    {
      id: "proveedor",
      etiqueta: "Proveedor",
      tipo: "seleccion",
      valores: (c) => [c.proveedor ?? SIN_VALOR],
      etiquetaSinValor: "Sin proveedor",
      agrupable: true,
    },
    {
      id: "tienda",
      etiqueta: "Tienda",
      tipo: "seleccion",
      valores: (c) => [c.tienda ?? SIN_VALOR],
      etiquetaSinValor: "Sin tienda",
      agrupable: true,
    },
    {
      id: "cliente",
      etiqueta: "Cliente",
      tipo: "seleccion",
      valores: (c) => [c.cliente ?? SIN_VALOR],
      etiquetaSinValor: "Sin cliente",
      agrupable: true,
    },
    {
      id: "viaEnvio",
      etiqueta: "Vía de envío",
      tipo: "seleccion",
      valores: (c) => (c.viaEnvio.length ? c.viaEnvio : [SIN_VALOR]),
      opciones: () => VIAS_ENVIO.map((v) => ({ valor: v.valor, etiqueta: v.etiqueta })),
      etiquetaSinValor: "Sin vía",
      agrupable: true,
    },
    {
      id: "prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      valores: (c) => [c.prioridad ?? SIN_VALOR],
      opciones: () => PRIORIDADES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })),
      etiquetaSinValor: "Sin prioridad",
      agrupable: true,
      ordenGrupos: PRIORIDADES.map((p) => p.valor),
    },
    {
      id: "etiquetas",
      etiqueta: "Etiquetas",
      tipo: "seleccion",
      valores: (c) => (c.etiquetas.length ? c.etiquetas : [SIN_VALOR]),
      etiquetaSinValor: "Sin etiquetas",
      agrupable: true,
    },
    {
      id: "planificacionMes",
      etiqueta: "Planificación",
      tipo: "seleccion",
      valores: (c) => [c.planificacion ?? SIN_VALOR],
      etiquetaSinValor: "Sin planificación",
      agrupable: true,
    },
    {
      id: "vinculo",
      etiqueta: "Productos",
      tipo: "seleccion",
      valores: (c) => [c.tipo !== "pais" ? "no_aplica" : c.productos > 0 ? "con" : "sin"],
      opciones: () => [
        { valor: "sin", etiqueta: "Sin productos vinculados" },
        { valor: "con", etiqueta: "Con productos vinculados" },
        { valor: "no_aplica", etiqueta: "Importadora (no lleva)" },
      ],
      agrupable: true,
    },
    { id: "nombreCompra", etiqueta: "Nombre", tipo: "texto", valor: (c) => `${numeroOC(c.numero)} ${c.nombre} ${c.proveedor ?? ""} ${c.lineas.map((l) => `${l.codigo} ${l.nombre}`).join(" ")}` },
    { id: "codigo", etiqueta: "Código", tipo: "texto", valor: (c) => c.codigo ?? "" },
    { id: "trackId", etiqueta: "Track ID", tipo: "texto", valor: (c) => c.trackId ?? "" },
    { id: "orden", etiqueta: "Orden", tipo: "texto", valor: (c) => c.orden ?? "" },
    { id: "qtyTotal", etiqueta: "QTY Total", tipo: "numero", valor: (c) => c.qtyTotal },
    { id: "montoTotal", etiqueta: "Monto Total", tipo: "numero", valor: (c) => c.montoTotal },
    { id: "valorUnitario", etiqueta: "Valor Unitario", tipo: "numero", valor: (c) => valorUnitario(c) },
    { id: "primerPago", etiqueta: "Primer Pago", tipo: "numero", valor: (c) => c.primerPago },
    { id: "segundoPago", etiqueta: "Segundo Pago", tipo: "numero", valor: (c) => c.segundoPago },
    { id: "pagadoAProveedor", etiqueta: "Pagado a Proveedor", tipo: "numero", valor: (c) => c.pagadoAProveedor },
    { id: "pagoPendiente", etiqueta: "Pago Pendiente", tipo: "numero", valor: (c) => c.pagoPendiente },
    { id: "cobradoCliente", etiqueta: "Cobrado Cliente", tipo: "numero", valor: (c) => c.cobradoCliente },
    { id: "pendienteCliente", etiqueta: "Pendiente Cliente", tipo: "numero", valor: (c) => c.pendienteCliente },
    { id: "fechaLimite", etiqueta: "Fecha límite", tipo: "fecha", valor: (c) => c.fechaLimite },
    { id: "fechaLlegada", etiqueta: "Fecha de llegada", tipo: "fecha", valor: (c) => c.fechaLlegada },
    { id: "fechaPago1", etiqueta: "Fecha de Pago (1)", tipo: "fecha", valor: (c) => c.fechaPago1 },
    { id: "fechaPago2", etiqueta: "Fecha de Pago (2)", tipo: "fecha", valor: (c) => c.fechaPago2 },
    { id: "fechaEnvio", etiqueta: "Fecha de Envío", tipo: "fecha", valor: (c) => c.fechaEnvio },
    { id: "creado", etiqueta: "Creada", tipo: "fecha", valor: (c) => c.creadoEn.slice(0, 10) },
    { id: "cerrado", etiqueta: "Cerrada", tipo: "fecha", valor: (c) => (c.cerradoEn ? c.cerradoEn.slice(0, 10) : null) },
    { id: "dias", etiqueta: "Días", tipo: "numero", valor: (c) => diasDeCompra(c) },
    {
      id: "asignado",
      etiqueta: "Persona asignada",
      tipo: "seleccion",
      valores: (c) => [c.asignadoNombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin asignar",
      agrupable: true,
    },
    { id: "factura", etiqueta: "Factura", tipo: "seleccion", valores: (c) => [c.factura ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Sí" }, { valor: "no", etiqueta: "No" }] },
    { id: "financiamiento", etiqueta: "Financiamiento", tipo: "seleccion", valores: (c) => [c.financiamiento ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Sí" }, { valor: "no", etiqueta: "No" }] },
  ],
  // Como una lista de ClickUp: arranca agrupada por Etapa, en el orden del flujo. Cada persona puede agrupar por otra cosa.
  vistaInicial: { agrupar: "etapa" },
  csvAntes: [
    { etiqueta: "N.º OC", valor: (c) => numeroOC(c.numero) },
    { etiqueta: "Código", valor: (c) => c.codigo ?? "" },
    { etiqueta: "Nombre", valor: (c) => c.nombre },
    { etiqueta: "Tipo", valor: (c) => (c.tipo === "importacion" ? "Importadora" : "País") },
  ],
  cerrados: {
    etiqueta: "Cerrados",
    esCerrado: (c) => ETAPAS_CERRADAS.includes(c.etapa),
    campoEstado: "etapa",
    valoresCerrados: ETAPAS_CERRADAS,
    ocultosPorDefecto: true,
    exclusivo: true,
  },
  total: (c) => c.montoTotal ?? 0,
};
