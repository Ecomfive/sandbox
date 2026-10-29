// Actividad del cliente (29 oct 2026): por qué escribió un dropshipper cada día, analizado con IA a partir de sus mensajes de WhatsApp. Aquí vive lo puro y con prueba: los motivos
// posibles, cómo se agrupan los mensajes por día de Panamá, qué se le manda a la IA (sin números de teléfono ni correos), cómo se valida lo que devuelve y cómo se resume.

export interface Motivo {
  id: string;
  etiqueta: string;
}

/** Los motivos por los que escribe un dropshipper. La IA solo puede elegir de esta lista (lo demás se descarta), así se pueden contar. */
export const MOTIVOS: Motivo[] = [
  { id: "estado_guia", etiqueta: "Estado de una guía o pedido" },
  { id: "novedad_entrega", etiqueta: "Novedad de entrega" },
  { id: "devolucion", etiqueta: "Devolución o reembolso" },
  { id: "producto_stock", etiqueta: "Producto o stock" },
  { id: "precio_comision", etiqueta: "Precio o comisión" },
  { id: "retiro_pago", etiqueta: "Retiro o pago" },
  { id: "cuenta_acceso", etiqueta: "Cuenta o acceso" },
  { id: "como_empezar", etiqueta: "Cómo empezar o cómo se usa" },
  { id: "queja", etiqueta: "Queja o reclamo" },
  { id: "saludo", etiqueta: "Saludo o sin motivo claro" },
  { id: "otro", etiqueta: "Otro" },
];

const ID_MOTIVOS = new Set(MOTIVOS.map((m) => m.id));
export const etiquetaDeMotivo = (id: string): string => MOTIVOS.find((m) => m.id === id)?.etiqueta ?? id;

/** Cómo quedó la consulta de ese día: resuelta, sin resolver o sin pregunta (solo informó o saludó). */
export type EstadoDia = "resuelta" | "pendiente" | "sin_consulta";
export const ESTADOS_DIA: EstadoDia[] = ["resuelta", "pendiente", "sin_consulta"];
export const ETIQUETA_ESTADO: Record<EstadoDia, string> = { resuelta: "Resuelta", pendiente: "Sin resolver", sin_consulta: "Sin consulta" };

export const MAX_MOTIVOS_POR_DIA = 3;
export const MAX_RESUMEN = 240;
/** Lo que se le manda a la IA por pedido: los días más recientes sin analizar, con tope de mensajes por día y de letras por mensaje. */
export const MAX_DIAS_POR_PEDIDO = 14;
export const MAX_MENSAJES_POR_DIA = 40;
export const MAX_LETRAS_MENSAJE = 400;

export interface MensajeActividad {
  id: string;
  direccion: string;
  tipo: string;
  texto: string | null;
  momento: string;
}

export interface DiaActividad {
  dia: string;
  mensajes: MensajeActividad[];
  /** Cambia cuando llega o se oculta un mensaje de ese día: si no cambió, no se vuelve a analizar. */
  firma: string;
}

const DESFASE_PANAMA_MS = 5 * 3600 * 1000;
/** El día (AAAA-MM-DD) de un momento en la hora de Panamá, que no tiene horario de verano. */
export const diaDePanama = (iso: string): string => new Date(new Date(iso).getTime() - DESFASE_PANAMA_MS).toISOString().slice(0, 10);

const DESCRIPCION_TIPO: Record<string, string> = {
  imagen: "[mandó una foto]",
  audio: "[mandó un audio]",
  video: "[mandó un video]",
  documento: "[mandó un documento]",
  sticker: "[mandó un sticker]",
  ubicacion: "[mandó una ubicación]",
  reaccion: "[reaccionó a un mensaje]",
};

/** Solo cuenta lo que dijeron el dropshipper o el equipo (las notas privadas del equipo no se analizan). */
const cuenta = (m: MensajeActividad) => m.direccion === "entrante" || m.direccion === "saliente";

/** Agrupa los mensajes por día de Panamá, del día más viejo al más nuevo, cada día con sus mensajes en orden. */
export function agruparPorDia(mensajes: MensajeActividad[]): DiaActividad[] {
  const porDia = new Map<string, MensajeActividad[]>();
  for (const m of [...mensajes].filter(cuenta).sort((a, b) => a.momento.localeCompare(b.momento))) {
    const d = diaDePanama(m.momento);
    porDia.set(d, [...(porDia.get(d) ?? []), m]);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, ms]) => ({ dia, mensajes: ms, firma: `${ms.length}:${ms[ms.length - 1].id}` }));
}

/** Los días que hay que (volver a) analizar: los que no tienen análisis guardado o cuya firma cambió. */
export function diasPorAnalizar(dias: DiaActividad[], guardados: ReadonlyMap<string, string>): DiaActividad[] {
  return dias.filter((d) => guardados.get(d.dia) !== d.firma);
}

/** El texto de un mensaje sin lo que no debe llegar a la IA: teléfonos, correos y enlaces largos. Recortado a `MAX_LETRAS_MENSAJE`. */
export function textoParaIA(m: MensajeActividad): string {
  const base = (m.texto ?? "").trim() || DESCRIPCION_TIPO[m.tipo] || "[mensaje sin texto]";
  const limpio = base
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[número]")
    .replace(/https?:\/\/\S+/g, "[enlace]")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length > MAX_LETRAS_MENSAJE ? `${limpio.slice(0, MAX_LETRAS_MENSAJE)}…` : limpio;
}

/** La conversación de esos días, lista para el pedido: un bloque por día con «Cliente:» y «Equipo:». Si un día trae muchos mensajes, se quedan los últimos. */
export function conversacionParaIA(dias: DiaActividad[]): string {
  return dias
    .map((d) => {
      const ms = d.mensajes.slice(-MAX_MENSAJES_POR_DIA);
      const omitidos = d.mensajes.length - ms.length;
      return [`## ${d.dia}`, ...(omitidos > 0 ? [`(${omitidos} mensajes anteriores de ese día no se incluyen)`] : []), ...ms.map((m) => `${m.direccion === "entrante" ? "Cliente" : "Equipo"}: ${textoParaIA(m)}`)].join("\n");
    })
    .join("\n\n");
}

export function pedidoActividad(dias: DiaActividad[]): { instrucciones: string; texto: string } {
  const lista = MOTIVOS.map((m) => `- ${m.id}: ${m.etiqueta}`).join("\n");
  return {
    instrucciones: [
      "Eres un analista de atención al cliente de una empresa de dropshipping (Ecomfive). Los clientes son dropshippers que venden sus productos y escriben por WhatsApp al equipo.",
      "Te paso la conversación separada por días. Para CADA día di por qué escribió el cliente, con una frase corta en español y los motivos que correspondan.",
      `Motivos permitidos (usa solo estos ids, máximo ${MAX_MOTIVOS_POR_DIA} por día, el principal primero):\n${lista}`,
      'Estado de cada día: "resuelta" si el equipo respondió lo que preguntó, "pendiente" si el cliente quedó esperando una respuesta o una solución, "sin_consulta" si solo saludó o informó algo.',
      `El resumen dice qué pasó, sin copiar frases textuales, sin números de teléfono ni datos personales, de ${MAX_RESUMEN} letras como máximo.`,
      'Responde SOLO con JSON, sin texto antes ni después, con esta forma: {"dias":[{"dia":"AAAA-MM-DD","motivos":["estado_guia"],"resumen":"...","estado":"resuelta"}]}. Incluye todos los días que te paso, ninguno más.',
    ].join("\n\n"),
    texto: conversacionParaIA(dias),
  };
}

export interface AnalisisDia {
  dia: string;
  motivos: string[];
  resumen: string;
  estado: EstadoDia;
}

/** Lo que devolvió la IA, validado: solo los días pedidos, solo motivos de la lista (sin repetir), resumen recortado y un estado válido. Lo que no sirve se descarta. */
export function normalizarAnalisis(texto: string, diasPedidos: string[]): AnalisisDia[] {
  const i = texto.indexOf("{");
  const j = texto.lastIndexOf("}");
  if (i < 0 || j <= i) return [];
  let json: unknown;
  try {
    json = JSON.parse(texto.slice(i, j + 1));
  } catch {
    return [];
  }
  const lista = (json && typeof json === "object" ? (json as { dias?: unknown }).dias : null) as unknown;
  if (!Array.isArray(lista)) return [];
  const pedidos = new Set(diasPedidos);
  const vistos = new Set<string>();
  const salida: AnalisisDia[] = [];
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const dia = typeof o.dia === "string" ? o.dia.trim() : "";
    if (!pedidos.has(dia) || vistos.has(dia)) continue;
    const motivos = [...new Set((Array.isArray(o.motivos) ? o.motivos : []).filter((m): m is string => typeof m === "string" && ID_MOTIVOS.has(m)))].slice(0, MAX_MOTIVOS_POR_DIA);
    const resumen = (typeof o.resumen === "string" ? o.resumen : "").replace(/\s+/g, " ").trim().slice(0, MAX_RESUMEN);
    if (!resumen) continue;
    const estado = ESTADOS_DIA.includes(o.estado as EstadoDia) ? (o.estado as EstadoDia) : "sin_consulta";
    vistos.add(dia);
    salida.push({ dia, motivos: motivos.length ? motivos : ["otro"], resumen, estado });
  }
  return salida;
}

export interface FilaActividad {
  dia: string;
  motivos: string[];
  estado: EstadoDia;
}

export interface FrecuenciaMotivo {
  id: string;
  etiqueta: string;
  /** Días en que apareció como motivo. */
  dias: number;
}

/** Cuántos días apareció cada motivo, de más a menos frecuente (empata por el orden de la lista). Los días «sin consulta» no cuentan: no hay inquietud. */
export function frecuenciaDeMotivos(filas: readonly FilaActividad[]): FrecuenciaMotivo[] {
  const cuentas = new Map<string, number>();
  for (const f of filas) {
    if (f.estado === "sin_consulta") continue;
    for (const m of f.motivos) cuentas.set(m, (cuentas.get(m) ?? 0) + 1);
  }
  return MOTIVOS.filter((m) => cuentas.has(m.id))
    .map((m) => ({ id: m.id, etiqueta: m.etiqueta, dias: cuentas.get(m.id) ?? 0 }))
    .sort((a, b) => b.dias - a.dias);
}

export type SituacionCliente =
  | { tipo: "espera"; desde: string }
  | { tipo: "sin_resolver"; dia: string; resumen: string }
  | { tipo: "al_dia" };

/**
 * Si el cliente tiene algo pendiente: lo cierto es que el último mensaje del chat es suyo y nadie contestó (`espera`); si no, el análisis del último día dice si quedó una consulta
 * sin resolver aunque el equipo haya escrito (`sin_resolver`); si no, está al día.
 */
export function situacionDelCliente(ultimoDe: string | null, ultimoMensajeEn: string | null, ultimoDia: { dia: string; estado: EstadoDia; resumen: string } | null): SituacionCliente {
  if (ultimoDe === "entrante" && ultimoMensajeEn) return { tipo: "espera", desde: ultimoMensajeEn };
  if (ultimoDia?.estado === "pendiente") return { tipo: "sin_resolver", dia: ultimoDia.dia, resumen: ultimoDia.resumen };
  return { tipo: "al_dia" };
}
