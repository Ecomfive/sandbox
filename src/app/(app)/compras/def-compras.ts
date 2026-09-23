import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaCompra {
  id: string;
  nombre: string;
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
  revisadoAA: boolean;
  fechaLimite: string | null;
  fechaLlegada: string | null;
  fechaPago1: string | null;
  fechaPago2: string | null;
  fechaEnvio: string | null;
  inconveniente: string | null;
  planificacion: string | null;
  documentos: string | null;
  notas: string | null;
  asignadoNombre: string | null;
  creadoEn: string;
}

/** Las 14 etapas del flujo de compra y financiamiento, calcadas de la lista de ClickUp «Compras Dropi PA
 * Panamá» (Espacio > Carpeta Compras > Lista PA): del backlog a completado o descartado. */
export const ETAPAS_COMPRA = [
  { valor: "backlog", etiqueta: "Backlog - Pospuesto" },
  { valor: "solicitud_local", etiqueta: "01 - Solicitud Local" },
  { valor: "solicitud_internacional", etiqueta: "02 - Solicitud Internacional" },
  { valor: "cotizar", etiqueta: "03 - Cotizar" },
  { valor: "cotizado", etiqueta: "04 - Cotizado" },
  { valor: "evaluacion_proveedor", etiqueta: "05 - Evaluación de Proveedor" },
  { valor: "solicitud_proveedor", etiqueta: "06 - Solicitud a Proveedor" },
  { valor: "compra_pago", etiqueta: "07 - Compra y Pago" },
  { valor: "produccion", etiqueta: "08 - En Producción" },
  { valor: "tracking", etiqueta: "09 - Tracking" },
  { valor: "aviso_logistica", etiqueta: "10 - Aviso Logística" },
  { valor: "arribo_mercancia", etiqueta: "11 - Arribo Mercancía" },
  { valor: "completado", etiqueta: "12 - Completado" },
  { valor: "descartado", etiqueta: "Descartado" },
] as const;

export const ETAPA_ETIQUETA: Record<string, string> = Object.fromEntries(
  ETAPAS_COMPRA.map((e) => [e.valor, e.etiqueta])
);

export const etiquetaEtapa = (valor: string) => ETAPA_ETIQUETA[valor] ?? valor;

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

const TONO_ESTADO: Record<string, "neutral" | "success" | "warning" | "destructive" | "info"> = {
  backlog: "neutral",
  pendiente: "warning",
  en_gestion: "info",
  hecho: "success",
  en_revision: "warning",
  aprobado: "info",
  rechazado: "destructive",
  completado: "success",
};

export const tonoEstado = (valor: string) => TONO_ESTADO[valor] ?? "neutral";

/** El ciclo termina en «Completado» o «Descartado»: como Cerrados en Retiros, se ocultan por defecto. */
const ETAPAS_CERRADAS = ["completado", "descartado"];

/** Precio por unidad: no se guarda (es una fórmula, como en ClickUp), se calcula al mostrarla. */
export const valorUnitario = (c: FilaCompra): number | null =>
  c.montoTotal !== null && c.qtyTotal ? c.montoTotal / c.qtyTotal : null;

/** Cómo se filtra, agrupa y oculta lo cerrado en la tabla de Compras. */
export const DEF_COMPRAS: DefTabla<FilaCompra> = {
  clave: "compras",
  campos: [
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
    { id: "inconveniente", etiqueta: "Inconveniente", tipo: "texto", valor: (c) => c.inconveniente ?? "" },
    { id: "planificacion", etiqueta: "Planificación", tipo: "texto", valor: (c) => c.planificacion ?? "" },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (c) => c.notas ?? "" },
    {
      id: "asignado",
      etiqueta: "Persona asignada",
      tipo: "seleccion",
      valores: (c) => [c.asignadoNombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin asignar",
      agrupable: true,
    },
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
