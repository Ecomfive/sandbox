// Asistente de IA de Gestión de IDs Dropi (22 oct 2026) — OpenAI: cómo se arma el pedido a la API de Responses (con búsqueda en
// internet y fotos del producto) y cómo se lee la respuesta, sin red para poder probarlo. La llamada vive en `openai-api.ts`
// (solo servidor, clave `OPENAI_API_KEY`).

/** El modelo por defecto: el mismo que usaba «Sugerir títulos con IA», rápido y barato (se cambia con `OPENAI_MODEL`). */
export const MODELO_TEXTO = "gpt-4.1-mini";

export interface EntradaTexto {
  /** Las reglas fijas (rol, formato de la respuesta, qué no hacer). */
  instrucciones: string;
  /** Lo que se pide, con los datos de la publicación. */
  texto: string;
  /** Direcciones públicas de fotos del producto (la IA las ve), o `data:image/...;base64,...` si la imagen no se guarda. */
  imagenes: string[];
}

/** Los modelos de razonamiento (gpt-5, o3…) aceptan `reasoning`; los demás lo rechazan. */
const razona = (modelo: string) => /^(gpt-5|o\d)/i.test(modelo);

/** El cuerpo del pedido. Con `buscar` la IA puede consultar internet (Alibaba, Amazon, tiendas…). */
export function cuerpoRespuesta(modelo: string, e: EntradaTexto, buscar: boolean) {
  return {
    model: modelo,
    instructions: e.instrucciones,
    input: [{ role: "user", content: [{ type: "input_text", text: e.texto }, ...e.imagenes.map((url) => ({ type: "input_image", image_url: url }))] }],
    ...(buscar ? { tools: [{ type: "web_search" }] } : {}),
    ...(razona(modelo) ? { reasoning: { effort: "low" } } : {}),
  };
}

export interface Fuente {
  url: string;
  titulo: string;
}

export type RespuestaTexto = { texto: string; fuentes: Fuente[] } | { error: string };

/** Lo que gastó un pedido de texto, para anotar el consumo: tokens que devuelve la API y búsquedas en internet que hizo. */
export interface UsoTexto {
  tokensEntrada: number;
  tokensSalida: number;
  busquedas: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** El uso de una respuesta de la API de Responses de OpenAI (`usage` y las búsquedas de `output`). Sin datos, ceros. */
export function usoDeRespuesta(json: unknown): UsoTexto {
  const raiz = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const u = (raiz.usage && typeof raiz.usage === "object" ? raiz.usage : {}) as Record<string, unknown>;
  const busquedas = (Array.isArray(raiz.output) ? raiz.output : []).filter((i) => (i as { type?: unknown } | null)?.type === "web_search_call").length;
  return { tokensEntrada: num(u.input_tokens), tokensSalida: num(u.output_tokens), busquedas };
}

/** Solo direcciones http(s): lo que cita la IA se muestra como enlace. */
const esWeb = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);

/**
 * El texto de la respuesta y las páginas que consultó. La API devuelve una lista `output` con la búsqueda y el mensaje; el texto
 * está en los bloques `output_text` del mensaje, con sus citas en `annotations`. Sin texto, el motivo.
 */
export function extraerRespuesta(json: unknown): RespuestaTexto {
  const raiz = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const error = raiz.error && typeof raiz.error === "object" ? (raiz.error as Record<string, unknown>) : null;
  if (error) return { error: mensajeErrorOpenAI(0, String(error.message ?? "")) };
  const partes: string[] = [];
  const fuentes = new Map<string, Fuente>();
  for (const item of Array.isArray(raiz.output) ? raiz.output : []) {
    const m = item as Record<string, unknown>;
    if (m.type !== "message" || !Array.isArray(m.content)) continue;
    for (const c of m.content as Record<string, unknown>[]) {
      if (c.type !== "output_text" || typeof c.text !== "string") continue;
      partes.push(c.text);
      for (const a of Array.isArray(c.annotations) ? (c.annotations as Record<string, unknown>[]) : []) {
        if (a.type === "url_citation" && esWeb(a.url)) fuentes.set(a.url.split("#")[0], { url: a.url.split("#")[0], titulo: typeof a.title === "string" ? a.title.slice(0, 120) : "" });
      }
    }
  }
  const texto = partes.join("\n").trim();
  if (!texto) return { error: raiz.status === "incomplete" ? "La IA no alcanzó a terminar. Vuelve a intentar." : "La IA no devolvió ninguna respuesta." };
  return { texto, fuentes: [...fuentes.values()].slice(0, 10) };
}

/** Saca el JSON de lo que escribió la IA (con o sin ``` y con texto antes o después). null si no hay uno válido. */
export function extraerJson(texto: string): unknown {
  const sinCercas = texto.replace(/```(?:json)?/gi, "");
  const a = sinCercas.indexOf("{");
  const b = sinCercas.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(sinCercas.slice(a, b + 1));
  } catch {
    return null;
  }
}

/** Un error de la API en palabras de quien usa el sistema. */
export function mensajeErrorOpenAI(codigo: number, mensaje: string): string {
  if (codigo === 401 || /incorrect api key|invalid api key/i.test(mensaje)) return "La clave de OpenAI no es válida.";
  if (codigo === 403) return "OpenAI rechazó la clave: revisa que tenga permiso para este modelo.";
  if (codigo === 404 || /model.*(not found|does not exist)/i.test(mensaje)) return "El modelo de OpenAI no está disponible para esta clave (se cambia con OPENAI_MODEL).";
  if (codigo === 429) return /quota|billing/i.test(mensaje) ? "La cuenta de OpenAI no tiene saldo: revisa la facturación." : "Se alcanzó el límite de OpenAI por ahora. Espera un minuto y vuelve a intentar.";
  if (codigo >= 500) return "OpenAI no respondió. Vuelve a intentar en un momento.";
  return `OpenAI rechazó el pedido${mensaje ? `: ${mensaje.slice(0, 200)}` : "."}`;
}
