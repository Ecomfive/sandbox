// Solo se importa desde acciones del servidor: usa la clave OPENAI_API_KEY (nunca NEXT_PUBLIC_).
import { cuerpoRespuesta, extraerRespuesta, mensajeErrorOpenAI, MODELO_TEXTO, type EntradaTexto, type RespuestaTexto } from "./openai";

const ENDPOINT = "https://api.openai.com/v1/responses";

/** Hay clave de OpenAI configurada (`OPENAI_API_KEY`). */
export const openaiConectado = () => !!process.env.OPENAI_API_KEY?.trim();

export const modeloTexto = () => process.env.OPENAI_MODEL?.trim() || MODELO_TEXTO;

/** Pide a OpenAI un texto (con búsqueda en internet). Devuelve el texto y las fuentes, o el error en palabras claras. Nunca lanza. */
export async function pedirTexto(entrada: EntradaTexto, buscar = true): Promise<RespuestaTexto> {
  const clave = process.env.OPENAI_API_KEY?.trim();
  if (!clave) return { error: "Falta conectar OpenAI (la clave OPENAI_API_KEY)." };
  let r: Response;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify(cuerpoRespuesta(modeloTexto(), entrada, buscar)),
      signal: AbortSignal.timeout(170_000),
      cache: "no-store",
    });
  } catch (e) {
    return { error: (e as Error)?.name === "TimeoutError" ? "OpenAI tardó demasiado. Vuelve a intentar." : "No se pudo conectar con OpenAI." };
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    // Sin JSON: se informa por el código.
  }
  if (!r.ok) return { error: mensajeErrorOpenAI(r.status, (json as { error?: { message?: string } } | null)?.error?.message ?? "") };
  return extraerRespuesta(json);
}
