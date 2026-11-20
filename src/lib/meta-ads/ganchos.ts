// Anuncios Meta › el tipo de gancho de un video (20 nov 2026, pedido de Alcides: «qué hook funciona más»). El gancho es lo que pasa en los primeros segundos y la IA lo escribe con sus palabras; para contarlos y
// compararlos hace falta repartirlos en una lista fija. Aquí está la lista, el pedido a la IA para los videos que ya estaban analizados (se clasifica el texto del gancho, sin volver a ver el video) y la
// validación de lo que contesta. Lógica pura, con prueba.

export const TIPOS_GANCHO = ["pregunta", "problema o dolor", "resultado o transformación", "dato o cifra", "testimonio", "oferta o precio", "curiosidad o intriga", "demostración", "autoridad o experto", "otro"] as const;
export type TipoGancho = (typeof TIPOS_GANCHO)[number];

/** Qué quiere decir cada tipo, para que la IA clasifique siempre igual y para la ayuda en pantalla. */
export const EXPLICACION_GANCHO: Record<TipoGancho, string> = {
  pregunta: "abre con una pregunta al espectador («¿Te duele la espalda al despertar?»)",
  "problema o dolor": "nombra el problema o el dolor de entrada («Si sufres de piel seca…»)",
  "resultado o transformación": "muestra el resultado o el antes y después desde el primer segundo",
  "dato o cifra": "arranca con un número, un porcentaje o un dato duro",
  testimonio: "arranca con alguien que cuenta su experiencia",
  "oferta o precio": "arranca con el precio, el descuento o la promoción",
  "curiosidad o intriga": "promete algo sorprendente o deja una duda abierta («Nadie te cuenta esto…»)",
  demostración: "arranca usando o mostrando el producto en acción",
  "autoridad o experto": "arranca con un experto, una marca o una recomendación de autoridad",
  otro: "no encaja en ninguno de los anteriores",
};

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El tipo de la lista que corresponde a lo que dijo la IA (sin importar mayúsculas ni acentos); null si no es de la lista. */
export function ganchoTipoValido(v: unknown): TipoGancho | null {
  if (typeof v !== "string") return null;
  const k = sinAcentos(v);
  return TIPOS_GANCHO.find((t) => sinAcentos(t) === k) ?? null;
}

export interface GanchoParaClasificar {
  id: string;
  gancho: string;
  promesa?: string | null;
}

const recorte = (t: string | null | undefined, max: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** El pedido a la IA de texto: clasifica hasta 30 ganchos de una vez, uno por línea, y devuelve un JSON `{ "<id>": "<tipo>" }`. */
export function pedidoClasificarGanchos(items: GanchoParaClasificar[]): string {
  return [
    "Eres analista de publicidad en video. Clasifica el GANCHO de cada anuncio (lo que pasa en los primeros 3 segundos) en UNO de estos tipos:",
    ...TIPOS_GANCHO.map((t) => `- ${t}: ${EXPLICACION_GANCHO[t]}`),
    "Usa EXACTAMENTE el nombre del tipo. Si dudas, elige el que más pese; «otro» solo si de verdad no encaja.",
    'Contesta SOLO un JSON, sin texto antes ni después, de la forma {"<id>": "<tipo>", …} con una llave por cada id.',
    "Ganchos:",
    ...items.slice(0, 30).map((i) => `${i.id} :: ${recorte(i.gancho, 300)}${i.promesa ? ` (promete: ${recorte(i.promesa, 120)})` : ""}`),
  ].join("\n");
}

/** Lo que contestó la IA, validado: solo ids que se pidieron y tipos de la lista. Lo que no sirve se omite (nunca se confía en la IA). */
export function leerClasificacionGanchos(texto: string | null | undefined, ids: string[]): Map<string, TipoGancho> {
  const salida = new Map<string, TipoGancho>();
  if (!texto) return salida;
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return salida;
  let o: unknown;
  try {
    o = JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    return salida;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return salida;
  const pedidos = new Set(ids);
  for (const [id, v] of Object.entries(o as Record<string, unknown>)) {
    const tipo = ganchoTipoValido(v);
    if (pedidos.has(id) && tipo) salida.set(id, tipo);
  }
  return salida;
}
