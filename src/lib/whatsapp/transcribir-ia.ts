// Transcribe un audio con la IA que tenga clave el sistema (30 oct 2026): OpenAI (`gpt-4o-mini-transcribe`, o el que diga `OPENAI_TRANSCRIBE_MODEL`) y, si no hay
// clave de OpenAI, Gemini (`GEMINI_TEXT_MODEL`, que también entiende audio). Solo servidor: usa OPENAI_API_KEY / CHATGPT_API_KEY o GEMINI_API_KEY (nunca NEXT_PUBLIC_).
// Anota el uso en «Consumo de IA». Nunca lanza: devuelve el motivo como `{ error }`.

import { registrarConsumo, type ContextoConsumo } from "@/lib/ia/consumo";
import { costoTranscripcion } from "@/lib/ia/precios";
import { formatoDeAudio, limpiarTranscripcion, PEDIDO_TRANSCRIPCION, SIN_VOZ } from "./transcripcion";

const MODELO_OPENAI = "gpt-4o-mini-transcribe";
const MODELO_GEMINI = "gemini-3.5-flash-lite";

const claveOpenai = () => process.env.OPENAI_API_KEY?.trim() || process.env.CHATGPT_API_KEY?.trim() || "";
const claveGemini = () => process.env.GEMINI_API_KEY?.trim() || "";

/** Si hay alguna IA conectada que pueda transcribir. */
export const transcripcionConectada = () => !!(claveOpenai() || claveGemini());

export type ResultadoTranscripcion = { texto: string; modelo: string } | { error: string };

export async function transcribirConIA(bytes: Uint8Array, mime: string, nombre: string | null, consumo: ContextoConsumo): Promise<ResultadoTranscripcion> {
  const formato = formatoDeAudio(mime, nombre);
  if (!formato) return { error: "Este audio está en un formato que no se puede transcribir (por ejemplo AMR)." };
  const openai = claveOpenai();
  const gemini = claveGemini();
  if (!openai && !gemini) return { error: "Falta conectar una IA para transcribir (la clave OPENAI_API_KEY o GEMINI_API_KEY)." };

  const proveedor = openai ? "openai" : "gemini";
  const modelo = openai ? process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || MODELO_OPENAI : process.env.GEMINI_TEXT_MODEL?.trim() || MODELO_GEMINI;
  const anotar = (ok: boolean, error?: string) => registrarConsumo(consumo, { proveedor, modelo, costoUsd: ok ? costoTranscripcion(modelo, bytes.byteLength) : 0, ok, error });

  let texto: string;
  try {
    if (openai) {
      const form = new FormData();
      form.append("model", modelo);
      form.append("file", new Blob([bytes as BlobPart], { type: formato.mime }), `audio.${formato.extension}`);
      form.append("response_format", "json");
      form.append("prompt", "Mensaje de voz de WhatsApp de un cliente de una tienda en línea, normalmente en español.");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${openai}` }, body: form, signal: AbortSignal.timeout(120_000), cache: "no-store" });
      const json = (await r.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
      if (!r.ok) {
        const error = r.status === 401 ? "La clave de OpenAI no es válida." : r.status === 429 ? "OpenAI está al límite de uso o sin crédito. Inténtalo más tarde." : "OpenAI no pudo transcribir el audio.";
        await anotar(false, json?.error?.message ?? error);
        return { error };
      }
      texto = limpiarTranscripcion(json?.text);
    } else {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": gemini },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: PEDIDO_TRANSCRIPCION }, { inline_data: { mime_type: formato.mime, data: Buffer.from(bytes).toString("base64") } }] }],
          generationConfig: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
      const json = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null;
      if (!r.ok) {
        await anotar(false, json?.error?.message ?? `Gemini ${r.status}`);
        return { error: "Gemini no pudo transcribir el audio." };
      }
      texto = limpiarTranscripcion((json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""));
    }
  } catch (e) {
    const error = (e as Error)?.name === "TimeoutError" ? "La transcripción tardó demasiado. Inténtalo de nuevo." : "No se pudo conectar con la IA para transcribir.";
    await anotar(false, error);
    return { error };
  }
  await anotar(true);
  if (!texto || texto.toLowerCase() === SIN_VOZ) return { error: "No se entendió nada en el audio (puede estar en silencio o con mucho ruido)." };
  return { texto, modelo };
}
