// Anuncios Meta › Gemini ve el video: solo servidor (usa GEMINI_API_KEY, nunca NEXT_PUBLIC_). El archivo se sube a la API de archivos de Gemini, se espera a que lo procese, se le pide el análisis (`pedidoAnalisisVideo`)
// y se borra de Gemini al terminar. También puede analizar solo texto e imagen cuando Meta no deja bajar el video. Anota el uso en «Consumo de IA». Nunca lanza: devuelve el motivo como `{ error }`.

import { registrarConsumo, type ContextoConsumo } from "@/lib/ia/consumo";
import { costoTexto } from "@/lib/ia/precios";

const BASE = "https://generativelanguage.googleapis.com";
const MODELO = "gemini-3.5-flash-lite";
const claveGemini = () => process.env.GEMINI_API_KEY?.trim() || "";
const modeloDeVideo = () => process.env.GEMINI_VIDEO_MODEL?.trim() || process.env.GEMINI_TEXT_MODEL?.trim() || MODELO;

export const geminiConectado = () => !!claveGemini();

type Uso = { promptTokenCount?: number; candidatesTokenCount?: number };
type Respuesta = { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Uso; error?: { message?: string } };

export type ResultadoGemini = { texto: string; modelo: string } | { error: string };

async function generar(partes: unknown[], contexto: ContextoConsumo, esperaMs: number): Promise<ResultadoGemini> {
  const clave = claveGemini();
  const modelo = modeloDeVideo();
  try {
    const r = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(esperaMs),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => null)) as Respuesta | null;
    if (!r.ok) {
      await registrarConsumo(contexto, { proveedor: "gemini", modelo, costoUsd: 0, ok: false, error: json?.error?.message ?? `Gemini ${r.status}` });
      return { error: r.status === 429 ? "Gemini está al límite de uso o sin crédito. Inténtalo más tarde." : r.status === 400 ? "Gemini no pudo leer ese video." : "Gemini no pudo analizarlo." };
    }
    const entrada = json?.usageMetadata?.promptTokenCount ?? 0;
    const salida = json?.usageMetadata?.candidatesTokenCount ?? 0;
    await registrarConsumo(contexto, { proveedor: "gemini", modelo, tokensEntrada: entrada, tokensSalida: salida, costoUsd: costoTexto(modelo, { tokensEntrada: entrada, tokensSalida: salida, busquedas: 0 }), ok: true });
    const texto = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return texto.trim() ? { texto, modelo } : { error: "Gemini no devolvió nada." };
  } catch (e) {
    const error = (e as Error)?.name === "TimeoutError" ? "Gemini tardó demasiado." : "No se pudo conectar con Gemini.";
    await registrarConsumo(contexto, { proveedor: "gemini", modelo, costoUsd: 0, ok: false, error });
    return { error };
  }
}

/** Sube el video a Gemini, espera a que lo procese, pide el análisis y lo borra. */
export async function analizarVideoConGemini(bytes: Uint8Array, mime: string, pedido: string, contexto: ContextoConsumo): Promise<ResultadoGemini> {
  const clave = claveGemini();
  if (!clave) return { error: "Falta conectar Gemini (la clave GEMINI_API_KEY)." };
  let nombre: string | null = null;
  try {
    const inicio = await fetch(`${BASE}/upload/v1beta/files`, {
      method: "POST",
      headers: { "x-goog-api-key": clave, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength), "X-Goog-Upload-Header-Content-Type": mime, "content-type": "application/json" },
      body: JSON.stringify({ file: { display_name: "video-anuncio" } }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const urlSubida = inicio.headers.get("x-goog-upload-url");
    if (!inicio.ok || !urlSubida || !urlSubida.startsWith(`${BASE}/`)) return { error: "Gemini no aceptó el video." };
    const subida = await fetch(urlSubida, { method: "POST", headers: { "Content-Length": String(bytes.byteLength), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: bytes as BodyInit, signal: AbortSignal.timeout(90_000), cache: "no-store" });
    const archivo = (await subida.json().catch(() => null)) as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } } | null;
    if (!subida.ok || !archivo?.file?.uri || !archivo.file.name) return { error: "Gemini no pudo recibir el video." };
    nombre = archivo.file.name;
    let estado = archivo.file.state ?? "PROCESSING";
    const hasta = Date.now() + 75_000;
    while (estado === "PROCESSING" && Date.now() < hasta) {
      await new Promise((r) => setTimeout(r, 3000));
      const g = await fetch(`${BASE}/v1beta/${nombre}`, { headers: { "x-goog-api-key": clave }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const j = (await g.json().catch(() => null)) as { state?: string } | null;
      estado = j?.state ?? estado;
    }
    if (estado !== "ACTIVE") return { error: estado === "FAILED" ? "Gemini no pudo procesar el video." : "Gemini tardó demasiado en procesar el video." };
    return await generar([{ file_data: { mime_type: archivo.file.mimeType ?? mime, file_uri: archivo.file.uri } }, { text: pedido }], contexto, 120_000);
  } catch (e) {
    return { error: (e as Error)?.name === "TimeoutError" ? "Gemini tardó demasiado con el video." : "No se pudo conectar con Gemini." };
  } finally {
    if (nombre) fetch(`${BASE}/v1beta/${nombre}`, { method: "DELETE", headers: { "x-goog-api-key": clave }, signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  }
}

/** Sin video: el texto del anuncio y, si se pudo bajar, su miniatura. */
export async function analizarSoloTextoConGemini(pedido: string, imagen: { bytes: Uint8Array; mime: string } | null, contexto: ContextoConsumo): Promise<ResultadoGemini> {
  if (!claveGemini()) return { error: "Falta conectar Gemini (la clave GEMINI_API_KEY)." };
  const partes: unknown[] = [];
  if (imagen) partes.push({ inline_data: { mime_type: imagen.mime, data: Buffer.from(imagen.bytes).toString("base64") } });
  partes.push({ text: pedido });
  return generar(partes, contexto, 60_000);
}
