import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export const ESTADOS = [
  { valor: "prospecto", etiqueta: "Prospecto" },
  { valor: "activo", etiqueta: "Activo" },
  { valor: "inactivo", etiqueta: "Inactivo" },
] as const;

export const NIVELES = [
  { valor: "nuevo", etiqueta: "Nuevo" },
  { valor: "regular", etiqueta: "Regular" },
  { valor: "vip", etiqueta: "VIP" },
] as const;

export const TIPOS_CASO = [
  { valor: "problema", etiqueta: "Problema" },
  { valor: "pedido", etiqueta: "Pedido" },
  { valor: "pago", etiqueta: "Pago" },
  { valor: "devolucion", etiqueta: "Devolución" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export const PRIORIDADES = [
  { valor: "alta", etiqueta: "Alta" },
  { valor: "normal", etiqueta: "Normal" },
  { valor: "baja", etiqueta: "Baja" },
] as const;

export const ESTADOS_CASO = [
  { valor: "abierto", etiqueta: "Abierto" },
  { valor: "en_curso", etiqueta: "En curso" },
  { valor: "resuelto", etiqueta: "Resuelto" },
] as const;

export const CANALES = [
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "correo", etiqueta: "Correo" },
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export const ESTADOS_PEDIDO = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "entregado", etiqueta: "Entregado" },
  { valor: "devuelto", etiqueta: "Devuelto" },
  { valor: "cancelado", etiqueta: "Cancelado" },
] as const;

export const TIPOS_INTERACCION = [
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "email", etiqueta: "Correo" },
  { valor: "reunion", etiqueta: "Reunión" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

type ConEtiqueta = readonly { valor: string; etiqueta: string }[];
const etiquetaDe = (lista: ConEtiqueta) => (valor: string) => lista.find((e) => e.valor === valor)?.etiqueta ?? valor;

/** Nombres de los países con los que se trabaja o de donde suelen ser los dropshippers (código ISO → nombre). */
const NOMBRES_PAIS: Record<string, string> = {
  AR: "Argentina", BO: "Bolivia", BR: "Brasil", CL: "Chile", CO: "Colombia", CR: "Costa Rica", DO: "Rep. Dominicana",
  EC: "Ecuador", ES: "España", GT: "Guatemala", HN: "Honduras", MX: "México", NI: "Nicaragua", PA: "Panamá",
  PE: "Perú", PY: "Paraguay", SV: "El Salvador", US: "Estados Unidos", UY: "Uruguay", VE: "Venezuela",
};
export const nombrePais = (codigo: string) => NOMBRES_PAIS[codigo] ?? codigo;

export const etiquetaEstado = etiquetaDe(ESTADOS);
export const etiquetaNivel = etiquetaDe(NIVELES);
export const etiquetaTipoCaso = etiquetaDe(TIPOS_CASO);
export const etiquetaPrioridad = etiquetaDe(PRIORIDADES);
export const etiquetaEstadoCaso = etiquetaDe(ESTADOS_CASO);
export const etiquetaCanal = etiquetaDe(CANALES);
export const etiquetaTipo = etiquetaDe(TIPOS_INTERACCION);

/** Un dropshipper con lo que se ve en el directorio, el ranking y su ficha. */
export interface FilaDropshipper {
  id: string;
  codigo: string;
  nombre: string;
  tienda: string | null;
  ciudad: string | null;
  email: string | null;
  telefono: string | null;
  estado: string;
  nivel: string;
  responsable: string | null;
  /** País de donde es (código ISO de 2 letras, «CO»), según su teléfono; null si no se sabe. */
  paisOrigen: string | null;
  /** Códigos de los países donde vende con nosotros («PA», «CR»); puede ser más de uno. */
  paises: string[];
  /** Fecha de ingreso (ISO, solo día). */
  ingreso: string | null;
  pedidosMes: number;
  ventasMes: number;
  /** Fecha del último pedido (ISO, solo día); null si nunca pidió. */
  ultimoPedido: string | null;
  casosAbiertos: number;
  etiquetas: string[];
  /** Etapa que tenía en ClickUp (leads, seguimiento, privado, dropshippers, archivado…); null si se creó aquí. */
  etapa: string | null;
  /** Productos que vende u ofrece. */
  productos: string[];
  notas: string | null;
  /** Pedidos de los últimos seis meses, del más antiguo al más reciente. */
  pedidosPorMes: number[];
}

export interface FilaCaso {
  id: string;
  codigo: string;
  titulo: string;
  dropshipperId: string;
  dropshipper: string;
  tipo: string;
  prioridad: string;
  estado: string;
  numeroPedido: string | null;
  responsable: string | null;
  canal: string;
  /** Horas transcurridas desde que se abrió. */
  horasAbierto: number;
}

export interface ResumenCrm {
  activos: number;
  activosDeltaMes: number | null;
  totalDropshippers: number;
  pedidosMes: number;
  pedidosDeltaPct: number | null;
  ventasMes: number;
  ventasDeltaPct: number | null;
  casosAbiertos: number;
  casosSinResponder: number;
  primeraRespuestaMin: number | null;
  primeraRespuestaDeltaMin: number | null;
  sinPedir30: number;
  /** Etiqueta del mes que resumen las tarjetas, p. ej. «septiembre 2026». */
  mes: string;
}

/** «hoy», «ayer», «hace 3 días»; «Sin pedidos» si nunca pidió. `hoy` es la fecha de referencia (ISO, solo día). */
export function etiquetaUltimoPedido(fecha: string | null, hoy: string): string {
  if (!fecha) return "Sin pedidos";
  const dias = diasEntre(fecha, hoy);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

export function diasEntre(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** «27 h» o «3 d» para el tiempo que lleva abierto un caso. */
export function etiquetaAntiguedad(horas: number): string {
  return horas >= 72 ? `${Math.floor(horas / 24)} d` : `${horas} h`;
}

/** Montos cortos para listas y rankings: «₡4,82 M», «₡870 mil», «$12,5 mil»; el exacto va en la ficha. */
export function montoCorto(valor: number, codigoPais: string): string {
  const simbolo = codigoPais === "CR" ? "₡" : "$";
  const nf = (n: number, dec: number) => n.toLocaleString("es-CR", { maximumFractionDigits: dec, minimumFractionDigits: dec });
  if (valor >= 1_000_000) return `${simbolo}${nf(valor / 1_000_000, 2)} M`;
  if (valor >= 1_000) return `${simbolo}${nf(valor / 1_000, valor >= 100_000 ? 0 : 1)} mil`;
  return `${simbolo}${nf(valor, 0)}`;
}

/** Directorio: se agrupa por estado y «Inactivos» es lo cerrado (oculto por defecto). */
export const DEF_DROPSHIPPERS: DefTabla<FilaDropshipper> = {
  clave: "crm-dropshippers",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (d) => [d.estado],
      opciones: () => ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ["activo", "prospecto", "inactivo"],
    },
    {
      id: "etapa",
      etiqueta: "Etapa",
      tipo: "seleccion",
      valores: (d) => [d.etapa ?? SIN_VALOR],
      etiquetaSinValor: "Sin etapa",
      agrupable: true,
    },
    {
      id: "nivel",
      etiqueta: "Nivel",
      tipo: "seleccion",
      valores: (d) => [d.nivel],
      opciones: () => NIVELES.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta })),
      agrupable: true,
      ordenGrupos: ["vip", "regular", "nuevo"],
    },
    {
      id: "responsable",
      etiqueta: "Responsable",
      tipo: "seleccion",
      valores: (d) => [d.responsable ?? SIN_VALOR],
      etiquetaSinValor: "Sin responsable",
      agrupable: true,
    },
    {
      id: "venta",
      etiqueta: "Vende en",
      tipo: "seleccion",
      valores: (d) => (d.paises.length ? d.paises : [SIN_VALOR]),
      etiquetaSinValor: "Sin país",
      formatearValor: (v) => nombrePais(v),
    },
    {
      id: "origen",
      etiqueta: "País de origen",
      tipo: "seleccion",
      valores: (d) => [d.paisOrigen ?? SIN_VALOR],
      etiquetaSinValor: "Sin origen",
      formatearValor: (v) => nombrePais(v),
      agrupable: true,
    },
    {
      id: "ciudad",
      etiqueta: "Ciudad",
      tipo: "seleccion",
      valores: (d) => [d.ciudad ?? SIN_VALOR],
      etiquetaSinValor: "Sin ciudad",
      agrupable: true,
    },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (d) => `${d.nombre} ${d.codigo} ${d.tienda ?? ""}` },
    { id: "contacto", etiqueta: "Correo o teléfono", tipo: "texto", valor: (d) => `${d.email ?? ""} ${d.telefono ?? ""}` },
    { id: "pedidos", etiqueta: "Pedidos del mes", tipo: "numero", valor: (d) => d.pedidosMes },
    { id: "ventas", etiqueta: "Ventas del mes", tipo: "numero", valor: (d) => d.ventasMes },
    { id: "ultimoPedido", etiqueta: "Último pedido", tipo: "fecha", valor: (d) => d.ultimoPedido },
    { id: "ingreso", etiqueta: "Ingreso", tipo: "fecha", valor: (d) => d.ingreso },
    {
      id: "etiqueta",
      etiqueta: "Etiqueta",
      tipo: "seleccion",
      valores: (d) => (d.etiquetas.length ? d.etiquetas : [SIN_VALOR]),
      etiquetaSinValor: "Sin etiquetas",
    },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (d) => d.notas ?? "" },
  ],
  cerrados: {
    etiqueta: "Inactivos",
    esCerrado: (d) => d.estado === "inactivo",
    campoEstado: "estado",
    valoresCerrados: ["inactivo"],
    ocultosPorDefecto: true,
  },
  vistaInicial: { agrupar: "estado" },
  csvAntes: [{ etiqueta: "Código", valor: (d) => d.codigo }],
};

/** Casos de soporte: «Resueltos» es lo cerrado (oculto por defecto). */
export const DEF_CASOS: DefTabla<FilaCaso> = {
  clave: "crm-casos",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (c) => [c.estado],
      opciones: () => ESTADOS_CASO.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ["abierto", "en_curso", "resuelto"],
    },
    {
      id: "prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      valores: (c) => [c.prioridad],
      opciones: () => PRIORIDADES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })),
      agrupable: true,
      ordenGrupos: ["alta", "normal", "baja"],
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (c) => [c.tipo],
      opciones: () => TIPOS_CASO.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      agrupable: true,
    },
    {
      id: "canal",
      etiqueta: "Canal",
      tipo: "seleccion",
      valores: (c) => [c.canal],
      opciones: () => CANALES.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta })),
      agrupable: true,
    },
    {
      id: "responsable",
      etiqueta: "Responsable",
      tipo: "seleccion",
      valores: (c) => [c.responsable ?? SIN_VALOR],
      etiquetaSinValor: "Sin responsable",
      agrupable: true,
    },
    { id: "dropshipper", etiqueta: "Dropshipper", tipo: "texto", valor: (c) => c.dropshipper },
    { id: "titulo", etiqueta: "Caso", tipo: "texto", valor: (c) => c.titulo },
    { id: "pedido", etiqueta: "Pedido", tipo: "texto", valor: (c) => c.numeroPedido ?? "" },
    { id: "antiguedad", etiqueta: "Horas abierto", tipo: "numero", valor: (c) => c.horasAbierto },
  ],
  cerrados: {
    etiqueta: "Resueltos",
    esCerrado: (c) => c.estado === "resuelto",
    campoEstado: "estado",
    valoresCerrados: ["resuelto"],
    ocultosPorDefecto: true,
  },
  vistaInicial: { agrupar: "estado" },
  csvAntes: [{ etiqueta: "Código", valor: (c) => c.codigo }],
};

export interface FilaInteraccion {
  id: string;
  fecha: string;
  dropshipper: string;
  tipo: string;
  nota: string;
}

/** Bitácora de interacciones (la versión 1 del CRM): se agrupa por dropshipper o por tipo de contacto. */
export const DEF_INTERACCIONES: DefTabla<FilaInteraccion> = {
  clave: "crm-interacciones",
  campos: [
    {
      id: "dropshipper",
      etiqueta: "Dropshipper",
      tipo: "seleccion",
      valores: (i) => [i.dropshipper || SIN_VALOR],
      etiquetaSinValor: "Sin dropshipper",
      agrupable: true,
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (i) => [i.tipo],
      opciones: () => TIPOS_INTERACCION.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      agrupable: true,
    },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (i) => i.fecha },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (i) => i.nota },
  ],
};
