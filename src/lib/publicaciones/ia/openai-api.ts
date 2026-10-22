// Solo se importa desde acciones del servidor: usa la clave OPENAI_API_KEY (o CHATGPT_API_KEY), nunca NEXT_PUBLIC_.
import { registrarConsumo, type ContextoConsumo } from "@/lib/ia/consumo";
import { costoTexto } from "@/lib/ia/precios";
import { cuerpoRespuesta, extraerRespuesta, mensajeErrorOpenAI, MODELO_TEXTO, usoDeRespuesta, type EntradaTexto, type RespuestaTexto } from "./openai";

const ENDPOINT = "https://api.openai.com/v1/responses";

const clave = () => process.env.OPENAI_API_KEY?.trim() || process.env.CHATGPT_API_KEY?.trim() || "";

/** Hay clave de OpenAI configurada (`OPENAI_API_KEY`, o `CHATGPT_API_KEY`). */
export const openaiConectado = () => !!clave();

export const modeloTexto = () => process.env.OPENAI_MODEL?.trim() || MODELO_TEXTO;

/**
 * Pide a OpenAI un texto (con búsqueda en internet). Devuelve el texto y las fuentes, o el error en palabras claras. Nunca lanza.
 * Con `consumo` anota lo que gastó (tokens, búsquedas y su costo estimado) en `ia_consumo`.
 */
export async function pedirTexto(entrada: EntradaTexto, buscar = true, consumo?: ContextoConsumo): Promise<RespuestaTexto> {
  const k = clave();
  if (!k) return { error: "Falta conectar OpenAI (la clave OPENAI_API_KEY)." };
  const modelo = modeloTexto();
  const anotar = (uso: { tokensEntrada: number; tokensSalida: number; busquedas: number }, ok: boolean, error?: string) =>
    consumo ? registrarConsumo(consumo, { proveedor: "openai", modelo, ...uso, costoUsd: costoTexto(modelo, uso), ok, error }) : Promise.resolve();
  const sinUso = { tokensEntrada: 0, tokensSalida: 0, busquedas: 0 };
  let r: Response;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${k}` },
      body: JSON.stringify(cuerpoRespuesta(modelo, entrada, buscar)),
      signal: AbortSignal.timeout(170_000),
      cache: "no-store",
    });
  } catch (e) {
    const error = (e as Error)?.name === "TimeoutError" ? "OpenAI tardó demasiado. Vuelve a intentar." : "No se pudo conectar con OpenAI.";
    await anotar(sinUso, false, error);
    return { error };
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    // Sin JSON: se informa por el código.
  }
  if (!r.ok) {
    const error = mensajeErrorOpenAI(r.status, (json as { error?: { message?: string } } | null)?.error?.message ?? "");
    await anotar(sinUso, false, error);
    return { error };
  }
  const respuesta = extraerRespuesta(json);
  // Si la API respondió, se cobró aunque lo que devolvió no sirva.
  await anotar(usoDeRespuesta(json), !("error" in respuesta), "error" in respuesta ? respuesta.error : undefined);
  return respuesta;
}
