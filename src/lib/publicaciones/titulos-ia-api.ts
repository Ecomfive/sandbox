// Gestión de IDs Dropi › Títulos con IA: la llamada a ChatGPT (Chat Completions de OpenAI). Solo servidor: usa OPENAI_API_KEY (o
// CHATGPT_API_KEY), que vive en Vercel y nunca llega al navegador. El modelo se cambia con OPENAI_MODEL. Nunca lanza: devuelve el
// error como valor para mostrarlo en la ficha.

import type { Reglas } from "./reglas";
import { errorOpenAI, leerSugerencias, promptTitulos, type DatosTitulo, type SugerenciaTitulo } from "./titulos-ia";

/** El modelo por defecto: rápido y barato para textos cortos. */
const MODELO = "gpt-4.1-mini";

const claveOpenAI = () => (process.env.OPENAI_API_KEY?.trim() || process.env.CHATGPT_API_KEY?.trim() || "");

export async function pedirTitulosIA(d: DatosTitulo, reglas: Reglas): Promise<{ sugerencias: SugerenciaTitulo[] } | { error: string }> {
  const clave = claveOpenAI();
  if (!clave) return { error: "Falta la clave de ChatGPT en el servidor (OPENAI_API_KEY en Vercel)." };
  const { sistema, usuario } = promptTitulos(d, reglas.max_titulo);
  let r: Response;
  try {
    r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      // Sin `temperature`: los modelos de razonamiento no la aceptan, y así sirve cualquier OPENAI_MODEL.
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || MODELO,
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    return { error: "ChatGPT no respondió a tiempo. Prueba otra vez." };
  }
  if (!r.ok) return { error: errorOpenAI(r.status) };
  const sugerencias = leerSugerencias(await r.json().catch(() => null), d, reglas);
  if (!sugerencias) return { error: "No se entendió la respuesta de ChatGPT. Prueba otra vez." };
  if (!sugerencias.length) return { error: `ChatGPT no dio títulos de ${reglas.max_titulo} caracteres o menos. Prueba otra vez.` };
  return { sugerencias };
}
