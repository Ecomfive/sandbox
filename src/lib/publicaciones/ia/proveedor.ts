// Solo se importa desde acciones del servidor: usa las claves OPENAI_API_KEY o ANTHROPIC_API_KEY (nunca NEXT_PUBLIC_).
// Elige con qué IA de texto se trabaja: la que tenga clave (`AI_PROVEEDOR=openai|anthropic` fuerza una si hay las dos).
import { registrarConsumo, type ContextoConsumo } from "@/lib/ia/consumo";
import { costoTexto } from "@/lib/ia/precios";
import { cuerpoMensaje, extraerMensaje, mensajeErrorClaude, MODELO_CLAUDE, usoDeMensaje } from "./anthropic";
import { openaiConectado, modeloTexto, pedirTexto } from "./openai-api";
import type { EntradaTexto, RespuestaTexto } from "./openai";

export type ProveedorIA = "openai" | "anthropic";

const claudeConectado = () => !!process.env.ANTHROPIC_API_KEY?.trim();

/** Qué IA de texto se usa, o null si no hay ninguna clave. */
export function proveedorTexto(): ProveedorIA | null {
  const forzado = process.env.AI_PROVEEDOR?.trim().toLowerCase();
  if (forzado === "anthropic" && claudeConectado()) return "anthropic";
  if (forzado === "openai" && openaiConectado()) return "openai";
  if (openaiConectado()) return "openai";
  if (claudeConectado()) return "anthropic";
  return null;
}

export const NOMBRE_PROVEEDOR: Record<ProveedorIA, string> = { openai: "OpenAI", anthropic: "Claude" };

/** El nombre del modelo de texto en uso (para guardarlo con lo que genera). */
export function modeloDeTexto(): string {
  const p = proveedorTexto();
  return p === "anthropic" ? process.env.ANTHROPIC_MODEL?.trim() || MODELO_CLAUDE : modeloTexto();
}

async function pedirClaude(entrada: EntradaTexto, buscar: boolean, consumo?: ContextoConsumo): Promise<RespuestaTexto> {
  const clave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!clave) return { error: "Falta conectar Claude (la clave ANTHROPIC_API_KEY)." };
  const modelo = modeloDeTexto();
  const anotar = (uso: { tokensEntrada: number; tokensSalida: number; busquedas: number }, ok: boolean, error?: string) =>
    consumo ? registrarConsumo(consumo, { proveedor: "anthropic", modelo, ...uso, costoUsd: costoTexto(modelo, uso), ok, error }) : Promise.resolve();
  const sinUso = { tokensEntrada: 0, tokensSalida: 0, busquedas: 0 };
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(cuerpoMensaje(modelo, entrada, buscar)),
      signal: AbortSignal.timeout(170_000),
      cache: "no-store",
    });
  } catch (e) {
    const error = (e as Error)?.name === "TimeoutError" ? "Claude tardó demasiado. Vuelve a intentar." : "No se pudo conectar con Claude.";
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
    const error = mensajeErrorClaude(r.status, (json as { error?: { message?: string } } | null)?.error?.message ?? "");
    await anotar(sinUso, false, error);
    return { error };
  }
  const respuesta = extraerMensaje(json);
  await anotar(usoDeMensaje(json), !("error" in respuesta), "error" in respuesta ? respuesta.error : undefined);
  return respuesta;
}

/** Pide un texto a la IA conectada (con búsqueda en internet). Devuelve el texto y las fuentes, o el error en palabras claras. Nunca lanza. */
export async function pedirIA(entrada: EntradaTexto, buscar = true, consumo?: ContextoConsumo): Promise<RespuestaTexto> {
  const p = proveedorTexto();
  if (!p) return { error: "Falta conectar una IA de texto (la clave OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel)." };
  return p === "anthropic" ? pedirClaude(entrada, buscar, consumo) : pedirTexto(entrada, buscar, consumo);
}
