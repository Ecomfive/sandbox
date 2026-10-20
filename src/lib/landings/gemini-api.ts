// Solo se importa desde acciones y páginas del servidor: usa la clave GEMINI_API_KEY.
import { cuerpoPedido, extraerImagen, mensajeError, MODELO_IMAGEN, type RespuestaImagen } from "./gemini";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Hay clave de Gemini configurada (`GEMINI_API_KEY`, nunca `NEXT_PUBLIC_`). */
export const geminiConectado = () => !!process.env.GEMINI_API_KEY?.trim();

export const modeloImagen = () => process.env.GEMINI_IMAGE_MODEL?.trim() || MODELO_IMAGEN;

/** Pide una imagen a Gemini. Devuelve la imagen en base64 o el error en palabras de quien usa el sistema. Nunca lanza. */
export async function generarImagen(prompt: string, referencias: { mime: string; base64: string }[], proporcion: string): Promise<RespuestaImagen> {
  const clave = process.env.GEMINI_API_KEY?.trim();
  if (!clave) return { error: "Falta conectar Gemini (la clave GEMINI_API_KEY)." };
  let r: Response;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpoPedido(modeloImagen(), prompt, referencias, proporcion)),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });
  } catch (e) {
    return { error: (e as Error)?.name === "TimeoutError" ? "Gemini tardó demasiado. Vuelve a intentar." : "No se pudo conectar con Gemini." };
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    // Sin JSON: se informa por el código.
  }
  if (!r.ok) {
    const err = (json as { error?: { message?: string } } | null)?.error;
    return { error: mensajeError(r.status, err?.message ?? "") };
  }
  return extraerImagen(json);
}
