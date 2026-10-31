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
  { id: "consulta_id_dropi", etiqueta: "Preguntó por un ID de Dropi" },
  { id: "privatizar_id", etiqueta: "Pidió privatizar o reservar un ID" },
  { id: "material_producto", etiqueta: "Pidió fotos, videos o material de un producto" },
  // Pedidos y guías
  { id: "estado_guia", etiqueta: "Preguntó por el estado de una guía" },
  { id: "entrega_demorada", etiqueta: "Reclamó una entrega demorada" },
  { id: "novedad_entrega", etiqueta: "Consultó por una novedad de entrega" },
  { id: "cambio_cancelacion", etiqueta: "Pidió cancelar o cambiar un pedido" },
  { id: "cobertura_envio", etiqueta: "Preguntó por cobertura o zonas de envío" },
  { id: "tiempos_entrega", etiqueta: "Preguntó por tiempos de entrega" },
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
/** La etiqueta de un motivo: de la lista fija, de los que la IA fue creando (`extra`: id → etiqueta) o, si es de la primera versión, la de entonces. */
export const etiquetaDeMotivo = (id: string, extra?: Readonly<Record<string, string>>): string => MOTIVOS.find((m) => m.id === id)?.etiqueta ?? extra?.[id] ?? MOTIVOS_ANTERIORES[id] ?? id;

/**
 * Cuántas veces cambió lo que se le pide a la IA. Un día analizado con una versión anterior se vuelve a analizar. v2: motivos más específicos y productos. v3 (29 oct 2026, el caso de
 * José Sinisterra: empezó preguntando por un ID de Dropi y no se registró): motivos de IDs y más, el primer motivo es lo que originó el día, los primeros mensajes de un día largo ya no
 * se pierden y la IA puede proponer un motivo nuevo cuando ninguno sirve.
 */
export const VERSION_ANALISIS = 3;

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
/** De un día con más mensajes que `MAX_MENSAJES_POR_DIA`, los primeros que se conservan (lo que originó la conversación) además de los últimos. */
export const MENSAJES_DE_INICIO = 10;
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

/**
 * La conversación de esos días, lista para el pedido: un bloque por día con «Cliente:» y «Equipo:». Si un día trae más de `MAX_MENSAJES_POR_DIA` mensajes se quitan los **del medio**: se
 * conservan los primeros (`MENSAJES_DE_INICIO`, que son lo que originó la conversación) y los últimos. Antes se quedaban solo los últimos y un día largo perdía su comienzo.
 */
export function conversacionParaIA(dias: DiaActividad[]): string {
  const linea = (m: MensajeActividad) => `${m.direccion === "entrante" ? "Cliente" : "Equipo"}: ${textoParaIA(m)}`;
  return dias
    .map((d) => {
      if (d.mensajes.length <= MAX_MENSAJES_POR_DIA) return [`## ${d.dia}`, ...d.mensajes.map(linea)].join("\n");
      const inicio = d.mensajes.slice(0, MENSAJES_DE_INICIO);
      const final = d.mensajes.slice(-(MAX_MENSAJES_POR_DIA - MENSAJES_DE_INICIO));
      const omitidos = d.mensajes.length - inicio.length - final.length;
      return [`## ${d.dia}`, ...inicio.map(linea), `(${omitidos} mensajes del medio de ese día no se incluyen)`, ...final.map(linea)].join("\n");
    })
    .join("\n\n");
}

/** Lo máximo que la IA puede inventar de motivos nuevos en un mismo pedido, y cuántos motivos propios puede llegar a haber en total (para que la lista no se llene de variantes). */
export const MAX_MOTIVOS_NUEVOS_POR_PEDIDO = 3;
export const MAX_MOTIVOS_PROPIOS = 60;

/** `extras`: los motivos que la IA fue creando antes (se ofrecen como uno más de la lista). */
export function pedidoActividad(dias: DiaActividad[], extras: readonly Motivo[] = []): { instrucciones: string; texto: string } {
  const lista = [...MOTIVOS, ...extras].map((m) => `- ${m.id}: ${m.etiqueta}`).join("\n");
  return {
    instrucciones: [
      "Eres un analista de atención al cliente de una empresa de dropshipping (Ecomfive). Los clientes son dropshippers que venden sus productos y escriben por WhatsApp al equipo.",
      "Te paso la conversación separada por días. Para CADA día di por qué escribió el cliente, con una frase corta en español, los motivos que correspondan y los productos por los que preguntó.",
      `Motivos permitidos (usa solo estos ids, máximo ${MAX_MOTIVOS_POR_DIA} por día; elige el más específico que corresponda):\n${lista}`,
      "El PRIMER motivo de cada día es el que originó la conversación ese día: lo primero que el cliente preguntó o pidió (lo que dice en sus primeros mensajes), aunque después se hable de otras cosas. No lo reemplaces por un motivo de lo que pasó después.",
      "Un mensaje cuenta como consulta aunque no tenga signos de pregunta: si el cliente solo escribe un ID de Dropi, el nombre de un producto o un número de guía, está preguntando por eso (por su disponibilidad, estado o precio). Eso NO es «sin_consulta».",
      `Si de verdad ningún motivo permitido describe el motivo principal del día, escribe en "motivo_nuevo" una etiqueta corta (de 3 a 8 palabras, empezando con un verbo en pasado: «Preguntó por…», «Pidió…», «Reportó…», «Consultó…») y no uses "otro" para ese día. Úsalo solo cuando no sirva ninguno, no para una variante de uno que ya existe, y no más de ${MAX_MOTIVOS_NUEVOS_POR_PEDIDO} veces en total. Si ya describes bien el motivo con un id de la lista, deja "motivo_nuevo" vacío.`,
      `Productos: escribe el nombre de cada producto por el que el cliente preguntó o mostró interés, tal como se nombró en la conversación (por ejemplo "Cutting Mix", "Aceite de semilla de calabaza"), sin cantidades ni precios, máximo ${MAX_PRODUCTOS_POR_DIA} por día. Si solo dio el ID de Dropi de un producto (un número), escribe "ID 11446" con ese número. Si no nombró ninguno, una lista vacía. No inventes productos y no pongas categorías generales como "suplementos".`,
      'Estado de cada día: "resuelta" si el equipo respondió lo que preguntó, "pendiente" si el cliente quedó esperando una respuesta o una solución, "sin_consulta" si solo saludó o informó algo.',
      `El resumen dice qué pasó y, si preguntó por productos, los nombra; sin copiar frases textuales, sin números de teléfono ni datos personales, de ${MAX_RESUMEN} letras como máximo.`,
      'Responde SOLO con JSON, sin texto antes ni después, con esta forma: {"dias":[{"dia":"AAAA-MM-DD","motivos":["llegada_mercancia"],"motivo_nuevo":"","productos":["Cutting Mix"],"resumen":"...","estado":"resuelta"}]}. Incluye todos los días que te paso, ninguno más.',
    ].join("\n\n"),
    texto: conversacionParaIA(dias),
  };
}

export interface AnalisisDia {
  dia: string;
  motivos: string[];
  /** Los nombres que escribió la IA; se juntan con los del catálogo en `productosDelAnalisis`. */
  productos: string[];
  /** Una etiqueta nueva que propuso la IA porque ningún motivo servía (limpia); null si no propuso ninguna. Se junta con las que ya existen en `resolverMotivoNuevo`. */
  motivoNuevo: string | null;
  resumen: string;
  estado: EstadoDia;
}

const limpiarProducto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/^[«"'“]+|[»"'”.,;:]+$/g, "").trim().slice(0, MAX_NOMBRE_PRODUCTO);

export const MIN_ETIQUETA = 8;
export const MAX_ETIQUETA = 70;

/** Una etiqueta propuesta por la IA, limpia: sin comillas ni punto final, de `MIN_ETIQUETA` a `MAX_ETIQUETA` letras y de al menos dos palabras; si no sirve, null. */
export function limpiarEtiquetaNueva(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const e = t.replace(/\s+/g, " ").trim().replace(/^[«"'“]+|[»"'”.,;:]+$/g, "").trim();
  if (e.length < MIN_ETIQUETA || e.length > MAX_ETIQUETA || e.split(" ").length < 2) return null;
  return e.charAt(0).toUpperCase() + e.slice(1);
}

/**
 * Lo que devolvió la IA, validado: solo los días pedidos, solo motivos de la lista (sin repetir; `extras` son los que la IA creó antes), productos limpios, resumen recortado, un estado
 * válido y, si propuso uno, su motivo nuevo. Lo que no sirve se descarta.
 */
export function normalizarAnalisis(texto: string, diasPedidos: string[], extras: readonly Motivo[] = []): AnalisisDia[] {
  const permitidos = new Set([...ID_MOTIVOS, ...extras.map((m) => m.id)]);
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
    const motivos = [...new Set((Array.isArray(o.motivos) ? o.motivos : []).filter((m): m is string => typeof m === "string" && permitidos.has(m)))].slice(0, MAX_MOTIVOS_POR_DIA);
    const productos = [...new Set((Array.isArray(o.productos) ? o.productos : []).filter((p): p is string => typeof p === "string").map(limpiarProducto).filter((p) => p.length >= 2))].slice(0, MAX_PRODUCTOS_POR_DIA);
    const resumen = (typeof o.resumen === "string" ? o.resumen : "").replace(/\s+/g, " ").trim().slice(0, MAX_RESUMEN);
    if (!resumen) continue;
    const estado = ESTADOS_DIA.includes(o.estado as EstadoDia) ? (o.estado as EstadoDia) : "sin_consulta";
    vistos.add(dia);
    // Un motivo nuevo propuesto reemplaza a «otro»: es justo lo que no cabía en la lista.
    const motivoNuevo = limpiarEtiquetaNueva(o.motivo_nuevo);
    const conOtro = motivos.filter((m) => m !== "otro");
    salida.push({ dia, motivos: motivoNuevo ? conOtro : motivos.length ? motivos : ["otro"], productos, motivoNuevo, resumen, estado });
  }
  return salida;
}

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Los verbos con que empiezan las etiquetas y las palabras de relleno: no distinguen un motivo de otro al compararlos. */
const PALABRAS_VACIAS = new Set(["preguntó", "pregunto", "pidió", "pidio", "reportó", "reporto", "consultó", "consulto", "solicitó", "solicito", "quiso", "quería", "queria", "de", "del", "la", "el", "los", "las", "un", "una", "por", "para", "sobre", "que", "con", "en", "y", "o", "al", "su", "sus"]);
const palabrasClave = (t: string): string[] => [...new Set(sinTildes(t).replace(/[^a-z0-9ñ ]+/g, " ").split(" ").filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)))];

/** El id de un motivo propio a partir de su etiqueta: «nuevo_» y las palabras clave en minúsculas sin tildes (hasta 40 letras). */
export function idDeMotivoNuevo(etiqueta: string): string {
  const base = palabrasClave(etiqueta).join("_").replace(/_+/g, "_").slice(0, 40).replace(/_$/, "");
  return `nuevo_${base || "motivo"}`;
}

/**
 * Qué hacer con un motivo nuevo que propuso la IA: si ya existe uno igual o muy parecido (las mismas palabras clave, o casi: 70 % o más) se usa ese y no se crea otro; si no, sale
 * un motivo nuevo con su id. Así «Preguntó por la garantía de un producto» y «Consultó sobre garantía del producto» no se vuelven dos.
 */
export function resolverMotivoNuevo(etiqueta: string, existentes: readonly Motivo[]): { id: string; etiqueta: string; nuevo: boolean } {
  const claves = palabrasClave(etiqueta);
  const id = idDeMotivoNuevo(etiqueta);
  for (const m of existentes) {
    if (m.id === id) return { id: m.id, etiqueta: m.etiqueta, nuevo: false };
    const otras = palabrasClave(m.etiqueta);
    if (!otras.length || !claves.length) continue;
    const comunes = claves.filter((w) => otras.includes(w)).length;
    if (comunes / new Set([...claves, ...otras]).size >= 0.7) return { id: m.id, etiqueta: m.etiqueta, nuevo: false };
  }
  return { id, etiqueta, nuevo: true };
}

/** Pone un motivo (el que salió de `resolverMotivoNuevo`) como el primero de un día, sin repetir ni pasar de `MAX_MOTIVOS_POR_DIA`. */
export const conMotivoPrimero = (motivos: readonly string[], id: string): string[] => [id, ...motivos.filter((m) => m !== id && m !== "otro")].slice(0, MAX_MOTIVOS_POR_DIA);

/** Los IDs de Dropi que la IA anotó como «ID 11446» en los productos de un día. */
export function idsDropiDeProductos(nombres: readonly string[]): string[] {
  return [...new Set(nombres.map((n) => /^ID\s*(\d{3,7})$/i.exec(n.trim())?.[1]).filter((x): x is string => !!x))];
}

/**
 * Los productos de un día con el nombre del catálogo cuando se reconocen («cutting mix» → «Cutting Mix»), para que contar el interés por producto siempre use el mismo nombre;
 * el que no está en el catálogo se queda como lo escribió la IA. Sin repetidos.
 */
export function productosDelAnalisis(nombres: readonly string[], catalogo: ProductoParaCruzar[], porIdDropi: ReadonlyMap<string, string> = new Map()): string[] {
  const salida: string[] = [];
  for (const n of nombres) {
    // «ID 11446»: el producto de esa publicación de Dropi, si se conoce.
    const idDropi = /^ID\s*(\d{3,7})$/i.exec(n.trim())?.[1];
    const nombre = (idDropi ? porIdDropi.get(idDropi) : undefined) ?? (idDropi ? `ID ${idDropi}` : (productosMencionados(n, catalogo, 1)[0]?.nombre ?? n));
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
export function frecuenciaDeMotivos(filas: readonly FilaActividad[], extra?: Readonly<Record<string, string>>): FrecuenciaMotivo[] {
  const cuentas = new Map<string, number>();
  for (const f of filas) {
    if (f.estado === "sin_consulta") continue;
    for (const m of f.motivos) cuentas.set(m, (cuentas.get(m) ?? 0) + 1);
  }
  const conocidos = MOTIVOS.filter((m) => cuentas.has(m.id)).map((m) => ({ id: m.id, etiqueta: m.etiqueta, dias: cuentas.get(m.id) ?? 0 }));
  // Los de la primera versión que ya no están en la lista siguen contando hasta que ese día se vuelva a analizar.
  const anteriores = [...cuentas.entries()].filter(([id]) => !ID_MOTIVOS.has(id)).map(([id, dias]) => ({ id, etiqueta: etiquetaDeMotivo(id, extra), dias }));
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

// ── Análisis completo del cliente ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// «Analizar» / «Volver a analizar» (29 oct 2026): además de leer cada día, la IA mira todo lo que ya se sabe del cliente y arma una lectura más completa: cómo es el trato, qué tan molesto o
// satisfecho está, qué tan urgente es, si hay riesgo de que deje de trabajar con nosotros, qué prometió el equipo y sigue pendiente, qué oportunidades hay y qué conviene hacer ahora.

export type Sentimiento = "positivo" | "neutral" | "molesto";
export type Riesgo = "alto" | "medio" | "bajo";
export type Urgencia = "alta" | "media" | "baja";

export const SENTIMIENTOS: Sentimiento[] = ["positivo", "neutral", "molesto"];
export const RIESGOS: Riesgo[] = ["alto", "medio", "bajo"];
export const URGENCIAS: Urgencia[] = ["alta", "media", "baja"];
export const ETIQUETA_SENTIMIENTO: Record<Sentimiento, string> = { positivo: "Satisfecho", neutral: "Neutral", molesto: "Molesto" };

export interface PerfilCliente {
  /** Cómo es el trato con este cliente, en pocas líneas. */
  perfil: string;
  sentimiento: Sentimiento;
  /** Qué tan urgente es atenderlo ahora. */
  urgencia: Urgencia;
  /** Riesgo de que deje de trabajar con nosotros. */
  riesgo: Riesgo;
  /** Lo que el equipo prometió o quedó en hacer y no se ve cumplido. */
  compromisos: string[];
  oportunidades: string[];
  proximaAccion: string;
}

export const MAX_PERFIL = 420;
export const MAX_LINEA_PERFIL = 160;
export const MAX_LINEAS_PERFIL = 4;
/** Cuántos días de resúmenes se le pasan a la IA para el análisis completo, y cuántos de los más recientes con sus mensajes. */
export const MAX_DIAS_RESUMEN = 90;
export const DIAS_RECIENTES_COMPLETOS = 3;

export interface ResumenDeDia {
  dia: string;
  estado: EstadoDia;
  motivos: string[];
  productos: string[];
  resumen: string;
}

/** El pedido del análisis completo: los resúmenes de los días ya analizados (los más recientes) y, de los últimos días, los mensajes tal cual para ver el detalle y el tono. */
export function pedidoPerfil(resumenes: readonly ResumenDeDia[], recientes: DiaActividad[], extra?: Readonly<Record<string, string>>): { instrucciones: string; texto: string } {
  const historial = [...resumenes]
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(-MAX_DIAS_RESUMEN)
    .map((r) => `- ${r.dia} [${ETIQUETA_ESTADO[r.estado]}] ${r.motivos.map((m) => etiquetaDeMotivo(m, extra)).join(", ")}${r.productos.length ? ` · productos: ${r.productos.join(", ")}` : ""}: ${r.resumen}`)
    .join("\n");
  const detalle = conversacionParaIA(recientes.slice(-DIAS_RECIENTES_COMPLETOS));
  return {
    instrucciones: [
      "Eres un analista de atención al cliente de una empresa de dropshipping (Ecomfive). Los clientes son dropshippers que venden sus productos y escriben por WhatsApp al equipo.",
      "Te paso el historial resumido día por día de un cliente y, al final, sus mensajes más recientes tal cual. Haz una lectura completa de ese cliente para quien lo atiende hoy.",
      `Devuelve SOLO JSON, sin texto antes ni después, con esta forma exacta: {"perfil":"...","sentimiento":"neutral","urgencia":"media","riesgo":"bajo","compromisos":["..."],"oportunidades":["..."],"proxima_accion":"..."}`,
      `- perfil: cómo es el trato con este cliente y qué suele necesitar, de ${MAX_PERFIL} letras como máximo.`,
      `- sentimiento: "positivo", "neutral" o "molesto", según el tono de sus mensajes recientes.`,
      `- urgencia: "alta", "media" o "baja": qué tan urgente es atenderlo ahora (espera respuesta, reclamo sin resolver, algo con fecha).`,
      `- riesgo: "alto", "medio" o "bajo": qué tan probable es que deje de trabajar con nosotros (quejas repetidas, demoras, tono molesto, deja de escribir).`,
      `- compromisos: hasta ${MAX_LINEAS_PERFIL} cosas que el equipo prometió o quedó en hacer y no se ve cumplido (por ejemplo "confirmar la fecha de llegada del Cutting Mix"). Lista vacía si no hay.`,
      `- oportunidades: hasta ${MAX_LINEAS_PERFIL} oportunidades de venta o de ayudarle (productos que le interesan, algo que pidió y se le puede ofrecer). Lista vacía si no hay.`,
      `- proxima_accion: lo más útil que puede hacer ahora quien lo atiende, en una frase de ${MAX_LINEA_PERFIL} letras como máximo.`,
      "Cada línea es corta y concreta, sin copiar frases textuales ni poner números de teléfono ni datos personales. No inventes nada que no esté en el historial.",
    ].join("\n\n"),
    texto: `Historial por día:\n${historial || "(sin días analizados)"}\n\nMensajes más recientes:\n${detalle || "(sin mensajes)"}`,
  };
}

const linea = (t: unknown, max = MAX_LINEA_PERFIL): string => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lineas = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).map((x) => linea(x)).filter((x) => x.length >= 3))].slice(0, MAX_LINEAS_PERFIL);

/** Lo que devolvió la IA para el análisis completo, validado. Sin un perfil escrito o con basura devuelve null; un valor fuera de lo permitido se vuelve neutral / media / medio. */
export function normalizarPerfil(texto: string): PerfilCliente | null {
  const i = texto.indexOf("{");
  const j = texto.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let json: unknown;
  try {
    json = JSON.parse(texto.slice(i, j + 1));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const perfil = linea(o.perfil, MAX_PERFIL);
  if (!perfil) return null;
  return {
    perfil,
    sentimiento: SENTIMIENTOS.includes(o.sentimiento as Sentimiento) ? (o.sentimiento as Sentimiento) : "neutral",
    urgencia: URGENCIAS.includes(o.urgencia as Urgencia) ? (o.urgencia as Urgencia) : "media",
    riesgo: RIESGOS.includes(o.riesgo as Riesgo) ? (o.riesgo as Riesgo) : "medio",
    compromisos: lineas(o.compromisos),
    oportunidades: lineas(o.oportunidades),
    proximaAccion: linea(o.proxima_accion),
  };
}
