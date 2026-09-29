import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaFiltro {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  estadoRegistro: string;
  estado: string;
  tipoEnvio: string | null;
  qtyProducto: number | null;
  precioTotal: number | null;
  precioUnitario: number | null;
  prioridad: string;
  asignadoNombre: string | null;
  asignadoEmail: string | null;
  asignadoAvatarUrl: string | null;
  tienda: string | null;
  aprobacionGestionada: boolean;
  comentarios: string | null;
  creadoEn: string;
}

/** El embudo de cotización de un producto candidato, calcado de la columna «Estado del Registro» de la lista
 * de ClickUp «Productos y Filtro PA»: de en cola a aprobado o descartado. */
export const ESTADOS_REGISTRO = [
  { valor: "en_cola", etiqueta: "En Cola" },
  { valor: "enviado_a_test", etiqueta: "Enviado a Test" },
  { valor: "cotizar", etiqueta: "Cotizar" },
  { valor: "cotizado", etiqueta: "Cotizado" },
  { valor: "aprobado", etiqueta: "Aprobado" },
  { valor: "descartado", etiqueta: "Descartado" },
] as const;

const ESTADO_REGISTRO_ETIQUETA: Record<string, string> = Object.fromEntries(
  ESTADOS_REGISTRO.map((e) => [e.valor, e.etiqueta])
);
export const etiquetaEstadoRegistro = (valor: string) => ESTADO_REGISTRO_ETIQUETA[valor] ?? valor;

/** Los mismos colores exactos que ClickUp le da a cada valor del campo personalizado «Estado del Registro»
 * en «Productos y Filtro PA», tomados de ahí para que la insignia se vea igual en nuestro sistema. */
const ESTADO_REGISTRO_COLOR: Record<string, string> = {
  en_cola: "#b5bcc2",
  enviado_a_test: "#02BCD4",
  cotizar: "#f9d900",
  cotizado: "#7C4DFF",
  aprobado: "#1bbc9c",
  descartado: "#e50000",
};
export const colorEstadoRegistro = (valor: string) => ESTADO_REGISTRO_COLOR[valor] ?? "#8D8D8D";

/** El «Estado» de ClickUp aparte del embudo — el estado de la tarea en sí (Pendiente/En Progreso/Completado),
 * igual que el «Estado» de Compras es distinto de su «Etapa». */
export const ESTADOS = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "en_progreso", etiqueta: "En Progreso" },
  { valor: "completado", etiqueta: "Completado" },
  { valor: "archivado", etiqueta: "Archivado" },
] as const;

const ESTADO_ETIQUETA: Record<string, string> = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.etiqueta]));
export const etiquetaEstado = (valor: string) => ESTADO_ETIQUETA[valor] ?? valor;

/** Los mismos colores exactos que ClickUp le da al «Estado» nativo de la tarea en «Productos y Filtro PA»,
 * leídos de su selector de estado para que la insignia se vea igual en nuestro sistema. */
const ESTADO_COLOR: Record<string, string> = {
  pendiente: "#8D8D8D",
  en_progreso: "#0880EA",
  completado: "#00B499",
  archivado: "#299764",
};
export const colorEstado = (valor: string) => ESTADO_COLOR[valor] ?? "#8D8D8D";

export const TIPOS_ENVIO = [
  { valor: "aereo", etiqueta: "Aéreo" },
  { valor: "maritimo", etiqueta: "Marítimo" },
] as const;

const TIPO_ENVIO_ETIQUETA: Record<string, string> = Object.fromEntries(TIPOS_ENVIO.map((t) => [t.valor, t.etiqueta]));
export const etiquetaTipoEnvio = (valor: string | null) => (valor ? (TIPO_ENVIO_ETIQUETA[valor] ?? valor) : null);

export const PRIORIDADES = [
  { valor: "urgente", etiqueta: "Urgente" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "normal", etiqueta: "Normal" },
  { valor: "baja", etiqueta: "Baja" },
] as const;

const PRIORIDAD_ETIQUETA: Record<string, string> = Object.fromEntries(PRIORIDADES.map((p) => [p.valor, p.etiqueta]));
export const etiquetaPrioridad = (valor: string) => PRIORIDAD_ETIQUETA[valor] ?? valor;

/** Los mismos colores exactos que usa la bandera de prioridad nativa de ClickUp en «Productos y Filtro
 * PA», leídos de su selector de prioridad para que la insignia se vea igual en nuestro sistema. */
const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: "#C62A2F",
  alta: "#FFC53D",
  normal: "#3E63DD",
  baja: "#BBBBBB",
};
export const colorPrioridad = (valor: string) => PRIORIDAD_COLOR[valor] ?? "#BBBBBB";

/** La etiqueta ("Etiquetas" de ClickUp) junto al nombre del producto: de qué tienda salió. Por ahora solo
 * hay estas dos en «Productos y Filtro PA» — cada una con su propio color de fondo Y de texto (no uno
 * calculado como las demás insignias), calcados tal cual de ClickUp. */
export const TIENDAS = [
  { valor: "kenku", etiqueta: "kenku" },
  { valor: "cliente_dropi", etiqueta: "cliente dropi" },
] as const;

const TIENDA_ETIQUETA: Record<string, string> = Object.fromEntries(TIENDAS.map((t) => [t.valor, t.etiqueta]));
export const etiquetaTienda = (valor: string | null) => (valor ? (TIENDA_ETIQUETA[valor] ?? valor) : null);

const TIENDA_COLOR: Record<string, { fondo: string; texto: string }> = {
  kenku: { fondo: "#E5E6FF", texto: "#5A43D6" },
  cliente_dropi: { fondo: "#FFE5E5", texto: "#C62A2F" },
};
export const colorTienda = (valor: string) => TIENDA_COLOR[valor] ?? { fondo: "#E5E5E5", texto: "#4B4B4B" };

/** El ciclo termina en «Aprobado» o «Descartado»: como Cerrados en Compras, se ocultan por defecto. */
const REGISTROS_CERRADOS = ["aprobado", "descartado"];

export const DEF_FILTROS: DefTabla<FilaFiltro> = {
  // v2: quien ya había tocado «Agrupar» (o probado la tabla antes de que existiera `vistaInicial`)
  // tenía guardada una vista sin agrupar, que ganaba por encima del nuevo valor por defecto — cambiar
  // la clave le da a todos una vista limpia una sola vez, para que sí arranque agrupada por «Estado del
  // Registro» como se pidió.
  clave: "compras-filtros-v2",
  campos: [
    {
      id: "estadoRegistro",
      etiqueta: "Estado del Registro",
      tipo: "seleccion",
      valores: (f) => [f.estadoRegistro],
      opciones: () => ESTADOS_REGISTRO.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_REGISTRO.map((e) => e.valor),
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS.map((e) => e.valor),
    },
    {
      id: "tipoEnvio",
      etiqueta: "Tipo de Envío",
      tipo: "seleccion",
      valores: (f) => [f.tipoEnvio ?? SIN_VALOR],
      opciones: () => [...TIPOS_ENVIO.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })), { valor: SIN_VALOR, etiqueta: "Sin definir" }],
      etiquetaSinValor: "Sin definir",
      agrupable: true,
    },
    {
      id: "prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      valores: (f) => [f.prioridad],
      opciones: () => PRIORIDADES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })),
      agrupable: true,
      ordenGrupos: PRIORIDADES.map((p) => p.valor),
    },
    {
      id: "tienda",
      etiqueta: "Tienda",
      tipo: "seleccion",
      valores: (f) => [f.tienda ?? SIN_VALOR],
      opciones: () => [...TIENDAS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })), { valor: SIN_VALOR, etiqueta: "Sin tienda" }],
      etiquetaSinValor: "Sin tienda",
      agrupable: true,
    },
    {
      id: "asignado",
      etiqueta: "Asignado a:",
      tipo: "seleccion",
      valores: (f) => [f.asignadoNombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin asignar",
      agrupable: true,
    },
    { id: "qtyProducto", etiqueta: "QTY Producto", tipo: "numero", valor: (f) => f.qtyProducto },
    { id: "precioTotal", etiqueta: "Precio Total", tipo: "numero", valor: (f) => f.precioTotal },
    { id: "precioUnitario", etiqueta: "Precio Unitario", tipo: "numero", valor: (f) => f.precioUnitario },
    { id: "comentarios", etiqueta: "Comentarios", tipo: "texto", valor: (f) => f.comentarios ?? "" },
  ],
  vistaInicial: { agrupar: "estadoRegistro", orden: "desc" },
  cerrados: {
    etiqueta: "Cerrados",
    esCerrado: (f) => REGISTROS_CERRADOS.includes(f.estadoRegistro),
    campoEstado: "estadoRegistro",
    valoresCerrados: REGISTROS_CERRADOS,
    ocultosPorDefecto: true,
    exclusivo: true,
  },
  total: (f) => f.precioTotal ?? 0,
};
