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

const TONO_ESTADO_REGISTRO: Record<string, "neutral" | "success" | "warning" | "destructive" | "info"> = {
  en_cola: "neutral",
  enviado_a_test: "info",
  cotizar: "warning",
  cotizado: "info",
  aprobado: "success",
  descartado: "destructive",
};
export const tonoEstadoRegistro = (valor: string) => TONO_ESTADO_REGISTRO[valor] ?? "neutral";

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

const TONO_ESTADO: Record<string, "neutral" | "success" | "warning" | "destructive" | "info"> = {
  pendiente: "neutral",
  en_progreso: "info",
  completado: "success",
  archivado: "neutral",
};
export const tonoEstado = (valor: string) => TONO_ESTADO[valor] ?? "neutral";

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

const TONO_PRIORIDAD: Record<string, "neutral" | "success" | "warning" | "destructive" | "info"> = {
  urgente: "destructive",
  alta: "warning",
  normal: "neutral",
  baja: "neutral",
};
export const tonoPrioridad = (valor: string) => TONO_PRIORIDAD[valor] ?? "neutral";

/** El ciclo termina en «Aprobado» o «Descartado»: como Cerrados en Compras, se ocultan por defecto. */
const REGISTROS_CERRADOS = ["aprobado", "descartado"];

export const DEF_FILTROS: DefTabla<FilaFiltro> = {
  clave: "compras-filtros",
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
      id: "asignado",
      etiqueta: "Persona asignada",
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
