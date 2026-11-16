// «¿Cuánto hay?» (16 nov 2026, migración 0302): las reglas puras. Una tienda pregunta cuánto hay de un producto (con una nota) y
// Yiletsi responde con la cantidad que contó despacho. Prueba en `reglas.test.ts`.

export const MAX_NOTA = 300;
export const MAX_CANTIDAD = 1_000_000;

export interface PreguntaCuantoHay {
  id: string;
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

/** El aviso «Para ti» de quien responde: «Kenku pregunta cuánto hay de Extracto de ajo». */
export function avisoPregunta(p: { producto: string; tienda: string; nota: string | null }, quien: string): { titulo: string; texto: string } {
  return {
    titulo: `${p.tienda} pregunta cuánto hay de ${p.producto}`.slice(0, 300),
    texto: `${quien}${p.nota ? `: «${p.nota}»` : " pregunta cuánto hay."}`.slice(0, 600),
  };
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
