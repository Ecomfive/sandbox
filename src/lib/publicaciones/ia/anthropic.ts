// Asistente de IA de Gestión de IDs Dropi — Claude (Anthropic): el mismo trabajo que con OpenAI, para cuando el equipo conecte esa clave
// en vez de la de OpenAI. Cómo se arma el pedido a la API de Messages (con búsqueda en internet y fotos) y cómo se lee la respuesta, sin
// red para poder probarlo. La llamada vive en `proveedor.ts` (solo servidor, clave `ANTHROPIC_API_KEY`).

import type { EntradaTexto, Fuente, RespuestaTexto, UsoTexto } from "./openai";

/** El modelo por defecto (se cambia con `ANTHROPIC_MODEL`). */
export const MODELO_CLAUDE = "claude-sonnet-5-5";

/** Una imagen para Claude: una dirección pública va por URL; una `data:` (imagen modelo que no se guarda) va como base64. */
export function imagenParaClaude(url: string) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
  return { type: "image", source: m ? { type: "base64", media_type: m[1], data: m[2] } : { type: "url", url } };
}

/** El cuerpo del pedido. Con `buscar` Claude puede consultar internet. */
export function cuerpoMensaje(modelo: string, e: EntradaTexto, buscar: boolean) {
  return {
    model: modelo,
    max_tokens: 8000,
    system: e.instrucciones,
    messages: [{ role: "user", content: [{ type: "text", text: e.texto }, ...e.imagenes.map(imagenParaClaude)] }],
    ...(buscar ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] } : {}),
  };
}

const esWeb = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);

/** El texto de la respuesta (los bloques de texto, tras la búsqueda) y las páginas que citó. Sin texto, el motivo. */
export function extraerMensaje(json: unknown): RespuestaTexto {
  const raiz = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (raiz.type === "error" && raiz.error && typeof raiz.error === "object") return { error: mensajeErrorClaude(0, String((raiz.error as Record<string, unknown>).message ?? "")) };
  const partes: string[] = [];
  const fuentes = new Map<string, Fuente>();
  for (const b of Array.isArray(raiz.content) ? (raiz.content as Record<string, unknown>[]) : []) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    partes.push(b.text);
    for (const c of Array.isArray(b.citations) ? (b.citations as Record<string, unknown>[]) : []) {
      if (esWeb(c.url)) fuentes.set(c.url.split("#")[0], { url: c.url.split("#")[0], titulo: typeof c.title === "string" ? c.title.slice(0, 120) : "" });
    }
  }
  const texto = partes.join("\n").trim();
  if (!texto) return { error: raiz.stop_reason === "max_tokens" ? "La IA no alcanzó a terminar. Vuelve a intentar." : "La IA no devolvió ninguna respuesta." };
  return { texto, fuentes: [...fuentes.values()].slice(0, 10) };
}

const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** El uso de una respuesta de Messages de Claude (`usage` y las búsquedas que hizo). Sin datos, ceros. */
export function usoDeMensaje(json: unknown): UsoTexto {
  const raiz = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const u = (raiz.usage && typeof raiz.usage === "object" ? raiz.usage : {}) as Record<string, unknown>;
  const herramientas = (u.server_tool_use && typeof u.server_tool_use === "object" ? u.server_tool_use : {}) as Record<string, unknown>;
  return { tokensEntrada: entero(u.input_tokens), tokensSalida: entero(u.output_tokens), busquedas: entero(herramientas.web_search_requests) };
}

/** Un error de la API en palabras de quien usa el sistema. */
export function mensajeErrorClaude(codigo: number, mensaje: string): string {
  if (codigo === 401 || /invalid x-api-key|authentication/i.test(mensaje)) return "La clave de Claude no es válida.";
  if (codigo === 403) return "Claude rechazó la clave: revisa que tenga permiso para este modelo.";
  if (codigo === 404 || /model/i.test(mensaje) && /not.?found|does not exist/i.test(mensaje)) return "El modelo de Claude no está disponible para esta clave (se cambia con ANTHROPIC_MODEL).";
  if (codigo === 429) return /credit|billing|balance/i.test(mensaje) ? "La cuenta de Claude no tiene saldo: revisa la facturación." : "Se alcanzó el límite de Claude por ahora. Espera un minuto y vuelve a intentar.";
  if (codigo >= 500 || codigo === 529) return "Claude no respondió. Vuelve a intentar en un momento.";
  return `Claude rechazó el pedido${mensaje ? `: ${mensaje.slice(0, 200)}` : "."}`;
}
