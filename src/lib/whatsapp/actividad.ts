// Actividad del cliente (29 oct 2026): por qué escribió un dropshipper cada día y por qué productos preguntó, analizado con IA a partir de sus mensajes de WhatsApp. Aquí vive lo puro y
// con prueba: los motivos posibles (específicos y siempre los mismos, para poder contarlos), cómo se agrupan los mensajes por día de Panamá, qué se le manda a la IA (sin números de
// teléfono ni correos), cómo se valida lo que devuelve, cómo se juntan los productos con los del catálogo y cómo se resume.

import { productosMencionados, type ProductoParaCruzar } from "@/lib/crm/productos-chat";

export interface Motivo {
  id: string;
  etiqueta: string;
}

/**
 * Los motivos por los que escribe un dropshipper. La IA solo puede elegir de esta lista (lo demás se descarta), así se pueden contar. Son específicos a propósito: «Preguntó cuándo llega
 * mercancía» dice más que «Producto o stock». Un motivo nuevo se agrega aquí (y a `VERSION_ANALISIS` si se quiere que los chats ya analizados se vuelvan a leer).
 */
export const MOTIVOS: Motivo[] = [
  // Productos
  { id: "stock_disponible", etiqueta: "Preguntó si hay stock de un producto" },
  { id: "llegada_mercancia", etiqueta: "Preguntó cuándo llega mercancía" },
  { id: "info_producto", etiqueta: "Pidió información de un producto" },
  { id: "catalogo", etiqueta: "Pidió el catálogo o productos nuevos" },
  { id: "producto_privado", etiqueta: "Pidió un producto privado o exclusivo" },
  { id: "producto_defectuoso", etiqueta: "Reportó un producto dañado o defectuoso" },
  // Pedidos y guías
  { id: "estado_guia", etiqueta: "Preguntó por el estado de una guía" },
  { id: "entrega_demorada", etiqueta: "Reclamó una entrega demorada" },
  { id: "novedad_entrega", etiqueta: "Consultó por una novedad de entrega" },
  { id: "cambio_cancelacion", etiqueta: "Pidió cancelar o cambiar un pedido" },
  { id: "devolucion_solicitud", etiqueta: "Pidió una devolución" },
  { id: "devolucion_estado", etiqueta: "Preguntó por una devolución en curso" },
  // Dinero
  { id: "retiro_estado", etiqueta: "Preguntó por un retiro" },
  { id: "pago_pendiente", etiqueta: "Reclamó un pago pendiente" },
  { id: "saldo_wallet", etiqueta: "Preguntó por su saldo o wallet" },
  { id: "precio_comision", etiqueta: "Preguntó por precios o comisiones" },
  // Cuenta y plataforma
  { id: "acceso_cuenta", etiqueta: "Tuvo un problema para entrar a su cuenta" },
  { id: "conectar_tienda", etiqueta: "Pidió ayuda para conectar su tienda" },
  { id: "error_plataforma", etiqueta: "Reportó un error en la plataforma" },
  // Aprender a vender
  { id: "como_empezar", etiqueta: "Preguntó cómo empezar a vender" },
  { id: "como_funciona", etiqueta: "Preguntó cómo funciona un proceso" },
  { id: "consejos_venta", etiqueta: "Pidió consejos para vender o hacer publicidad" },
  // Servicio
  { id: "queja_servicio", etiqueta: "Se quejó del servicio" },
  { id: "seguimiento", etiqueta: "Pidió seguimiento de un caso anterior" },
  { id: "saludo", etiqueta: "Saludó o escribió sin un motivo claro" },
  { id: "otro", etiqueta: "Otro motivo" },
];

/** Los motivos de la primera versión del análisis (más generales): los chats ya analizados con ellos se siguen mostrando hasta que se vuelvan a analizar. */
const MOTIVOS_ANTERIORES: Record<string, string> = {
  estado_guia: "Preguntó por el estado de una guía",
  producto_stock: "Producto o stock",
  precio_comision: "Preguntó por precios o comisiones",
  retiro_pago: "Retiro o pago",
  cuenta_acceso: "Cuenta o acceso",
  como_empezar: "Preguntó cómo empezar a vender",
  queja: "Queja o reclamo",
  devolucion: "Devolución o reembolso",
};

const ID_MOTIVOS = new Set(MOTIVOS.map((m) => m.id));
export const etiquetaDeMotivo = (id: string): string => MOTIVOS.find((m) => m.id === id)?.etiqueta ?? MOTIVOS_ANTERIORES[id] ?? id;

/** Cuántas veces cambió lo que se le pide a la IA. Un día analizado con una versión anterior se vuelve a analizar (los motivos de la v1 eran más generales y no traía productos). */
export const VERSION_ANALISIS = 2;

/** Cómo quedó la consulta de ese día: resuelta, sin resolver o sin pregunta (solo informó o saludó). */
export type EstadoDia = "resuelta" | "pendiente" | "sin_consulta";
export const ESTADOS_DIA: EstadoDia[] = ["resuelta", "pendiente", "sin_consulta"];
export const ETIQUETA_ESTADO: Record<EstadoDia, string> = { resuelta: "Resuelta", pendiente: "Sin resolver", sin_consulta: "Sin consulta" };

export const MAX_MOTIVOS_POR_DIA = 3;
export const MAX_PRODUCTOS_POR_DIA = 6;
export const MAX_NOMBRE_PRODUCTO = 60;
export const MAX_RESUMEN = 280;
/** Lo que se le manda a la IA por pedido: un tramo de días, con tope de mensajes por día y de letras por mensaje. Una conversación larga se analiza en varios pedidos. */
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

/** Lo que se guardó de un día analizado: con qué mensajes (firma) y con qué versión del análisis. */
export interface DiaGuardado {
  firma: string;
  version: number;
}

/** Los días que hay que (volver a) analizar: los que no tienen análisis guardado, cuya firma cambió o que se analizaron con una versión anterior. */
export function diasPorAnalizar(dias: DiaActividad[], guardados: ReadonlyMap<string, DiaGuardado>): DiaActividad[] {
  return dias.filter((d) => {
    const g = guardados.get(d.dia);
    return !g || g.firma !== d.firma || g.version < VERSION_ANALISIS;
  });
}

/** Parte una lista de días en tramos de `MAX_DIAS_POR_PEDIDO`, el tramo de los días más nuevos primero (lo más reciente importa más si se acaba el tiempo). */
export function tramosDeDias<T>(dias: readonly T[], tamano: number = MAX_DIAS_POR_PEDIDO): T[][] {
  const tramos: T[][] = [];
  for (let fin = dias.length; fin > 0; fin -= tamano) tramos.push(dias.slice(Math.max(0, fin - tamano), fin));
  return tramos;
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
      "Te paso la conversación separada por días. Para CADA día di por qué escribió el cliente, con una frase corta en español, los motivos que correspondan y los productos por los que preguntó.",
      `Motivos permitidos (usa solo estos ids, máximo ${MAX_MOTIVOS_POR_DIA} por día, el principal primero; elige el más específico que corresponda):\n${lista}`,
      `Productos: escribe el nombre de cada producto por el que el cliente preguntó o mostró interés, tal como se nombró en la conversación (por ejemplo "Cutting Mix", "Aceite de semilla de calabaza"), sin cantidades ni precios, máximo ${MAX_PRODUCTOS_POR_DIA} por día. Si no nombró ninguno, una lista vacía. No inventes productos y no pongas categorías generales como "suplementos".`,
      'Estado de cada día: "resuelta" si el equipo respondió lo que preguntó, "pendiente" si el cliente quedó esperando una respuesta o una solución, "sin_consulta" si solo saludó o informó algo.',
      `El resumen dice qué pasó y, si preguntó por productos, los nombra; sin copiar frases textuales, sin números de teléfono ni datos personales, de ${MAX_RESUMEN} letras como máximo.`,
      'Responde SOLO con JSON, sin texto antes ni después, con esta forma: {"dias":[{"dia":"AAAA-MM-DD","motivos":["llegada_mercancia"],"productos":["Cutting Mix"],"resumen":"...","estado":"resuelta"}]}. Incluye todos los días que te paso, ninguno más.',
    ].join("\n\n"),
    texto: conversacionParaIA(dias),
  };
}

export interface AnalisisDia {
  dia: string;
  motivos: string[];
  /** Los nombres que escribió la IA; se juntan con los del catálogo en `productosDelAnalisis`. */
  productos: string[];
  resumen: string;
  estado: EstadoDia;
}

const limpiarProducto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/^[«"'“]+|[»"'”.,;:]+$/g, "").trim().slice(0, MAX_NOMBRE_PRODUCTO);

/** Lo que devolvió la IA, validado: solo los días pedidos, solo motivos de la lista (sin repetir), productos limpios, resumen recortado y un estado válido. Lo que no sirve se descarta. */
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
    const productos = [...new Set((Array.isArray(o.productos) ? o.productos : []).filter((p): p is string => typeof p === "string").map(limpiarProducto).filter((p) => p.length >= 2))].slice(0, MAX_PRODUCTOS_POR_DIA);
    const resumen = (typeof o.resumen === "string" ? o.resumen : "").replace(/\s+/g, " ").trim().slice(0, MAX_RESUMEN);
    if (!resumen) continue;
    const estado = ESTADOS_DIA.includes(o.estado as EstadoDia) ? (o.estado as EstadoDia) : "sin_consulta";
    vistos.add(dia);
    salida.push({ dia, motivos: motivos.length ? motivos : ["otro"], productos, resumen, estado });
  }
  return salida;
}

/**
 * Los productos de un día con el nombre del catálogo cuando se reconocen («cutting mix» → «Cutting Mix»), para que contar el interés por producto siempre use el mismo nombre;
 * el que no está en el catálogo se queda como lo escribió la IA. Sin repetidos.
 */
export function productosDelAnalisis(nombres: readonly string[], catalogo: ProductoParaCruzar[]): string[] {
  const salida: string[] = [];
  for (const n of nombres) {
    const nombre = productosMencionados(n, catalogo, 1)[0]?.nombre ?? n;
    if (!salida.some((s) => s.toLowerCase() === nombre.toLowerCase())) salida.push(nombre);
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
  const conocidos = MOTIVOS.filter((m) => cuentas.has(m.id)).map((m) => ({ id: m.id, etiqueta: m.etiqueta, dias: cuentas.get(m.id) ?? 0 }));
  // Los de la primera versión que ya no están en la lista siguen contando hasta que ese día se vuelva a analizar.
  const anteriores = [...cuentas.entries()].filter(([id]) => !ID_MOTIVOS.has(id)).map(([id, dias]) => ({ id, etiqueta: etiquetaDeMotivo(id), dias }));
  return [...conocidos, ...anteriores].sort((a, b) => b.dias - a.dias);
}

export interface InteresEnProducto {
  nombre: string;
  /** Días en que algún cliente preguntó por él. */
  dias: number;
  /** Clientes distintos que preguntaron. */
  clientes: number;
}

/** Cuánto interés genera cada producto: en cuántos días y cuántos clientes distintos preguntaron por él (sin distinguir mayúsculas), del más al menos pedido. */
export function interesPorProducto(filas: readonly { cliente: string; productos: readonly string[] }[]): InteresEnProducto[] {
  const dias = new Map<string, { nombre: string; dias: number; clientes: Set<string> }>();
  for (const f of filas) {
    const delDia = new Map<string, string>();
    for (const x of f.productos.map((y) => y.trim()).filter(Boolean)) if (!delDia.has(x.toLowerCase())) delDia.set(x.toLowerCase(), x);
    for (const [clave, p] of delDia) {
      const acum = dias.get(clave) ?? { nombre: p, dias: 0, clientes: new Set<string>() };
      acum.dias += 1;
      acum.clientes.add(f.cliente);
      dias.set(clave, acum);
    }
  }
  return [...dias.values()].map((a) => ({ nombre: a.nombre, dias: a.dias, clientes: a.clientes.size })).sort((a, b) => b.clientes - a.clientes || b.dias - a.dias || a.nombre.localeCompare(b.nombre));
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
