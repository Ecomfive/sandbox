// «¿Cuánto hay?» (16 nov 2026, migración 0302): las reglas puras. Una tienda pregunta cuánto hay de un producto (con una nota) y
// Yiletsi responde con la cantidad que contó despacho. Prueba en `reglas.test.ts`.

export const MAX_NOTA = 300;

/**
 * Una pregunta sin tienda es de Proveeduría (19 nov 2026, migración 0336: Nicol, de Gestión de IDs Dropi, también pregunta). En la base es
 * `tienda_id` null; en las pantallas va con este id, para elegirla y agruparla como una tienda más.
 */
export const PROVEEDURIA = { id: "proveeduria", nombre: "Proveeduría" } as const;
export const MAX_CANTIDAD = 1_000_000;

/** Lo que se le pide a despacho: contar cuánto hay (lo de siempre) o tomar fotos reales del producto (20 nov 2026, migración 0342, pedido de Nicole). */
export type TipoPregunta = "cantidad" | "fotos";
export const TIPOS_PREGUNTA: { valor: TipoPregunta; etiqueta: string }[] = [
  { valor: "cantidad", etiqueta: "Cuánto hay" },
  { valor: "fotos", etiqueta: "Fotos reales" },
];
export const leerTipo = (v: unknown): TipoPregunta => (v === "fotos" ? "fotos" : "cantidad");

/** El almacén privado de las fotos reales (migración 0342). */
export const BUCKET_FOTOS_CUANTO_HAY = "cuanto-hay-fotos";

/** Cuántas fotos se suben a la vez y de cuánto pesa cada una (el almacén admite hasta 15 MB). */
export const MAX_FOTOS_POR_SUBIDA = 8;
export const MAX_FOTOS_POR_PEDIDO = 20;
export const MAX_BYTES_FOTO = 15 * 1024 * 1024;

/** Una foto subida por despacho, lista para mostrar (con su enlace firmado de una hora). */
export interface FotoCuantoHay {
  id: string;
  url: string;
}

export interface PreguntaCuantoHay {
  id: string;
  /** La tienda, o `PROVEEDURIA.id` si la pregunta es de Proveeduría. */
  tiendaId: string;
  tienda: string;
  producto: string;
  nota: string | null;
  pedidoPor: string;
  pedidoPorNombre: string | null;
  creadoEn: string;
  cantidad: number | null;
  respondidoPorNombre: string | null;
  respondidoEn: string | null;
  /** Qué se pidió: contar o tomar fotos. */
  tipo: TipoPregunta;
  /** El país de quien pidió (solo en las de fotos), para que despacho sepa de cuál es. */
  pais: string | null;
  /** Las fotos que subió despacho (solo en las de fotos). */
  fotos: FotoCuantoHay[];
}

/** La nota, limpia: sin espacios de más y hasta 300 caracteres; vacía = null. */
export function limpiarNota(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, MAX_NOTA);
  return t || null;
}

/** La cantidad que se responde: un entero de 0 a 1.000.000 (acepta «14» o 14); cualquier otra cosa, null. */
export function leerCantidad(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d{1,7}\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_CANTIDAD ? n : null;
}

/** Las preguntas por tienda, en el orden de las tiendas; dentro de cada una, la más vieja primero (la que lleva más esperando). */
export function agruparPorTienda<T extends { tiendaId: string; creadoEn: string }>(preguntas: T[], tiendas: { id: string; nombre: string }[]): { tienda: { id: string; nombre: string }; preguntas: T[] }[] {
  return tiendas
    .map((tienda) => ({ tienda, preguntas: preguntas.filter((p) => p.tiendaId === tienda.id).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)) }))
    .filter((g) => g.preguntas.length > 0);
}

/**
 * Las tiendas en las que la persona puede preguntar: todas si no tiene tiendas asignadas (`permitidas` null); si tiene, solo las suyas.
 * `unidadDe` dice a qué tienda de finanzas (`fin_unidades`) corresponde cada tienda, que es lo que guarda `perfiles.tiendas_permitidas`.
 */
export function tiendasDePersona<T extends { id: string }>(tiendas: T[], permitidas: string[] | null, unidadDe: (t: T) => string | null): T[] {
  if (permitidas === null) return tiendas;
  return tiendas.filter((t) => {
    const u = unidadDe(t);
    return !!u && permitidas.includes(u.toLowerCase());
  });
}

/** El aviso «Para ti» de quien preguntó: «Hay 14 · Extracto de ajo». */
export function avisoRespuesta(p: { producto: string; tienda: string }, cantidad: number, quien: string): { titulo: string; texto: string } {
  return {
    titulo: `Hay ${cantidad.toLocaleString("es-PA")} · ${p.producto}`.slice(0, 300),
    texto: `${quien} respondió tu pregunta de ${p.tienda}: hay ${cantidad.toLocaleString("es-PA")} de ${p.producto}.`.slice(0, 600),
  };
}

/** El aviso «Para ti» de quien responde: «Kenku pregunta cuánto hay de Extracto de ajo» o «Proveeduría pide fotos reales de Extracto de ajo». */
export function avisoPregunta(p: { producto: string; tienda: string; nota: string | null; tipo?: TipoPregunta }, quien: string): { titulo: string; texto: string } {
  const fotos = p.tipo === "fotos";
  return {
    titulo: (fotos ? `${p.tienda} pide fotos reales de ${p.producto}` : `${p.tienda} pregunta cuánto hay de ${p.producto}`).slice(0, 300),
    texto: `${quien}${p.nota ? `: «${p.nota}»` : fotos ? " pide fotos reales." : " pregunta cuánto hay."}`.slice(0, 600),
  };
}

/** El aviso «Para ti» de quien pidió las fotos: «Fotos reales · Extracto de ajo (3)». */
export function avisoFotos(p: { producto: string; tienda: string }, fotos: number, quien: string): { titulo: string; texto: string } {
  return {
    titulo: `Fotos reales · ${p.producto} (${fotos})`.slice(0, 300),
    texto: `${quien} subió ${fotos === 1 ? "1 foto" : `${fotos} fotos`} de ${p.producto} para ${p.tienda}.`.slice(0, 600),
  };
}

/** Las rutas de fotos que se pueden registrar: de la carpeta de ese pedido, sin repetir y hasta el máximo por subida. */
export function rutasDeFotosValidas(rutas: unknown, preguntaId: string): string[] {
  if (!Array.isArray(rutas)) return [];
  const carpeta = `fotos/${preguntaId}/`;
  const ok = new Set<string>();
  for (const r of rutas) {
    if (typeof r !== "string" || r.length > 300 || !r.startsWith(carpeta) || r.length === carpeta.length) continue;
    if (/[\\?#\u0000-\u001f]/.test(r) || /%(2e|2f|5c)/i.test(r) || r.includes("//") || r.slice(carpeta.length).includes("/") || r.includes("..")) continue;
    ok.add(r);
    if (ok.size >= MAX_FOTOS_POR_SUBIDA) break;
  }
  return [...ok];
}

const diaPanama = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const horaPanama = (d: Date) => d.toLocaleTimeString("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: false });

/** Cuándo, corto y en hora de Panamá: «hace 5 min», «hoy 9:40», «ayer 16:10» o «14 nov 16:10». */
export function cuandoCorto(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const min = Math.floor((ahora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const hoy = diaPanama(ahora);
  const ayer = diaPanama(new Date(ahora.getTime() - 86_400_000));
  const dia = diaPanama(d);
  if (dia === hoy) return `hoy ${horaPanama(d)}`;
  if (dia === ayer) return `ayer ${horaPanama(d)}`;
  return `${d.toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short" }).replace(".", "")} ${horaPanama(d)}`;
}

/**
 * Al responder «¿Cuánto hay?» el inventario de la bodega Despacho queda en esa cantidad (19 nov 2026, pedido de Hernán: «para no hacerlo doble»). Esto decide qué se puede hacer con el producto y
 * arma el motivo que queda en el historial; si se equivocó, se corrige respondiendo otra vez o con «Corregir» del inventario.
 */
export type DecisionConteo = { tipo: "ajustar"; diferencia: number } | { tipo: "igual" } | { tipo: "no"; motivo: string };

export function decidirConteoDespacho(p: { actual: number; cantidad: number; tipo: string; clase: string; manejaVencimiento: boolean; conVariantes: boolean }): DecisionConteo {
  if (p.tipo === "combo") return { tipo: "no", motivo: "es un pack o combo y no guarda stock propio" };
  if (p.clase === "test") return { tipo: "no", motivo: "es un producto de prueba, sin stock hasta pasarlo a Activo" };
  if (p.manejaVencimiento) return { tipo: "no", motivo: "maneja vencimiento: se corrige por lote en el inventario" };
  if (p.conVariantes) return { tipo: "no", motivo: "tiene variantes: se corrige en cada variante" };
  if (p.actual === p.cantidad) return { tipo: "igual" };
  return { tipo: "ajustar", diferencia: p.cantidad - p.actual };
}

/** El motivo del ajuste en el historial del producto: «Conteo de despacho (¿Cuánto hay?) de Yiletsi, pedido por Nicol: 120 → 98». */
export function motivoConteoDespacho(p: { quien: string; pidio: string | null; antes: number; despues: number }): string {
  return `Conteo de despacho (¿Cuánto hay?) de ${p.quien}${p.pidio ? `, pedido por ${p.pidio}` : ""}: ${p.antes.toLocaleString("es-PA")} → ${p.despues.toLocaleString("es-PA")}`.slice(0, 500);
}
