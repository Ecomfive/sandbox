// Solo se importa desde acciones y páginas del servidor: usa la clave GEMINI_API_KEY.
import { registrarConsumo, type ContextoConsumo } from "@/lib/ia/consumo";
import { costoImagen } from "@/lib/ia/precios";
import { cuerpoPedido, extraerImagen, mensajeError, MODELO_IMAGEN, type RespuestaImagen } from "./gemini";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Hay clave de Gemini configurada (`GEMINI_API_KEY`, nunca `NEXT_PUBLIC_`). */
export const geminiConectado = () => !!process.env.GEMINI_API_KEY?.trim();

export const modeloImagen = () => process.env.GEMINI_IMAGE_MODEL?.trim() || MODELO_IMAGEN;

/** Pide una imagen a Gemini. Devuelve la imagen en base64 o el error en palabras de quien usa el sistema. Nunca lanza. */
export async function generarImagen(prompt: string, referencias: { mime: string; base64: string }[], proporcion: string, consumo?: ContextoConsumo): Promise<RespuestaImagen> {
  const clave = process.env.GEMINI_API_KEY?.trim();
  if (!clave) return { error: "Falta conectar Gemini (la clave GEMINI_API_KEY)." };
  const modelo = modeloImagen();
  // Gemini no devuelve el costo: cada imagen que llega se anota con su precio estimado; un pedido que falla no cuesta.
  const anotar = (ok: boolean, error?: string) =>
    consumo ? registrarConsumo(consumo, { proveedor: "gemini", modelo, imagenes: ok ? 1 : 0, costoUsd: ok ? costoImagen(modelo, process.env.GEMINI_IMAGE_PRICE_USD) : 0, ok, error }) : Promise.resolve();
  let r: Response;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpoPedido(modelo, prompt, referencias, proporcion)),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });
  } catch (e) {
    const error = (e as Error)?.name === "TimeoutError" ? "Gemini tardó demasiado. Vuelve a intentar." : "No se pudo conectar con Gemini.";
    await anotar(false, error);
    return { error };
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    // Sin JSON: se informa por el código.
  }
  if (!r.ok) {
    const err = (json as { error?: { message?: string } } | null)?.error;
    const error = mensajeError(r.status, err?.message ?? "");
    await anotar(false, error);
    return { error };
  }
  const imagen = extraerImagen(json);
  await anotar(!("error" in imagen), "error" in imagen ? imagen.error : undefined);
  return imagen;
}
