// Portal del proveedor: traduce con Gemini lo escrito por personas (nombres de productos, notas, comentarios) y guarda cada traducción en
// `traducciones` (migración 0130) para no volver a pedirla. Solo servidor (usa GEMINI_API_KEY). Nunca lanza: si Gemini no responde, la
// pantalla muestra el texto original y lo que faltó se traduce la próxima vez que se abra.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTraduccion, necesitaTraduccion, promptTraduccion, type Idioma } from "./traduccion";

/** El modelo de texto por defecto (se cambia con `GEMINI_TEXT_MODEL`). */
const MODELO = "gemini-3.5-flash-lite";
const POR_PEDIDO = 60;
/** Cuántos pedidos a Gemini como máximo por carga de página (el resto, la próxima vez), para no demorar la página. */
const PEDIDOS_POR_CARGA = 4;

const huella = (texto: string) => createHash("sha256").update(texto).digest("hex");

async function pedirAGemini(textos: string[], destino: Idioma): Promise<string[] | null> {
  const clave = process.env.GEMINI_API_KEY?.trim();
  if (!clave) return null;
  const modelo = process.env.GEMINI_TEXT_MODEL?.trim() || MODELO;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptTraduccion(textos, destino) }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return leerTraduccion(await r.json(), textos.length);
  } catch {
    return null;
  }
}

/**
 * Las traducciones a `destino` de los textos que la necesitan (texto original → traducción). Lee lo ya guardado y pide a Gemini lo que
 * falta (en tandas), guardándolo. Un texto sin traducción no aparece en el resultado.
 */
export async function traducirTextos(supabase: SupabaseClient, textos: (string | null | undefined)[], destino: Idioma): Promise<Record<string, string>> {
  const unicos = [...new Set(textos.filter((t): t is string => necesitaTraduccion(t, destino)).map((t) => t.trim()))];
  const resultado: Record<string, string> = {};
  if (!unicos.length) return resultado;
  const porHuella = new Map(unicos.map((t) => [huella(t), t]));
  const huellas = [...porHuella.keys()];
  for (let i = 0; i < huellas.length; i += 300) {
    const { data, error } = await supabase.from("traducciones").select("huella, traduccion").eq("destino", destino).in("huella", huellas.slice(i, i + 300));
    if (error) return resultado; // sin la migración 0130: todo en su idioma original
    for (const f of data ?? []) resultado[porHuella.get(f.huella as string)!] = f.traduccion as string;
  }
  const faltan = unicos.filter((t) => !(t in resultado)).slice(0, POR_PEDIDO * PEDIDOS_POR_CARGA);
  const tandas: string[][] = [];
  for (let i = 0; i < faltan.length; i += POR_PEDIDO) tandas.push(faltan.slice(i, i + POR_PEDIDO));
  const respuestas = await Promise.all(tandas.map((t) => pedirAGemini(t, destino)));
  const nuevas: { huella: string; destino: Idioma; texto: string; traduccion: string; modelo: string }[] = [];
  tandas.forEach((tanda, i) => {
    const traducidas = respuestas[i];
    if (!traducidas) return;
    tanda.forEach((original, j) => {
      const tr = traducidas[j];
      if (!tr) return;
      resultado[original] = tr;
      nuevas.push({ huella: huella(original), destino, texto: original, traduccion: tr, modelo: process.env.GEMINI_TEXT_MODEL?.trim() || MODELO });
    });
  });
  if (nuevas.length) await supabase.from("traducciones").upsert(nuevas, { onConflict: "huella,destino", ignoreDuplicates: true });
  return resultado;
}
