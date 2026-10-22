// Gestión de IDs Dropi › Títulos con IA (22 oct 2026): el botón «Sugerir títulos con IA» de la ficha pide a ChatGPT títulos nuevos
// para la publicación con las mismas reglas de la revisión de optimización (español, 40 caracteres como máximo, la cantidad si es un
// suplemento, para qué sirve, sin mayúsculas sostenidas). Aquí van el pedido (prompt) y la lectura de la respuesta: cada sugerencia
// se vuelve a revisar con `revisarPublicacion` y la que no entra en Dropi (más larga que el máximo o muy corta) se descarta. Sin base
// ni React, con prueba; la llamada a OpenAI está en `titulos-ia-api.ts`.

import { revisarPublicacion, type ClaveRevision, type Revision } from "./optimizacion";
import type { Reglas } from "./reglas";

export interface DatosTitulo {
  /** El título como se ve hoy en Dropi (si no se leyó, el de la publicación). */
  titulo: string;
  /** El nombre de la publicación en el sistema (a veces trae la cantidad o el uso que el título de Dropi no dice). */
  nombre: string;
}

export interface SugerenciaTitulo {
  titulo: string;
  /** Una frase de la IA: por qué ese título vende mejor. */
  porque: string;
  /** Los puntos de título de la revisión de optimización, con este título. */
  revisiones: Revision[];
  cumple: number;
  total: number;
}

const CLAVES_TITULO: ClaveRevision[] = ["titulo_espanol", "titulo_largo", "titulo_cantidad", "titulo_angulo", "titulo_formato"];
/** Cuántas opciones se piden; se muestran las que pasan las reglas de Dropi. */
export const OPCIONES_PEDIDAS = 5;

/** Los puntos de título de la revisión de optimización para un título suelto (lo demás de la publicación no cuenta aquí). */
export function revisarTitulo(titulo: string, reglas: Pick<Reglas, "max_titulo" | "min_fotos" | "min_descripcion">): Revision[] {
  const revs = revisarPublicacion({ titulo, categoria: null, precio: null, precioSugerido: null, fotos: null, videos: null, descripcionLargo: null, leidoEnDropi: false }, reglas);
  return revs.filter((r) => CLAVES_TITULO.includes(r.clave));
}

/** El pedido a ChatGPT: las reglas de la revisión de optimización dichas en palabras, y los datos de la publicación. */
export function promptTitulos(d: DatosTitulo, maxTitulo: number): { sistema: string; usuario: string } {
  const sistema =
    "Eres especialista en catálogos de dropshipping en Latinoamérica (Dropi, Panamá). Escribes títulos de producto que venden: en español neutro, claros, que dicen qué es el producto y para qué sirve. Respondes solo con JSON.";
  const datos = [`Título actual en Dropi: «${d.titulo.trim()}»`];
  if (d.nombre.trim() && d.nombre.trim() !== d.titulo.trim()) datos.push(`Nombre interno del producto: «${d.nombre.trim()}»`);
  const usuario = [
    `Propón ${OPCIONES_PEDIDAS} títulos nuevos para este producto de Dropi.`,
    "",
    ...datos,
    "",
    "Reglas (todas obligatorias):",
    `- Máximo ${maxTitulo} caracteres contando espacios: Dropi no acepta más. Cuéntalos bien.`,
    "- Todo en español: traduce lo que venga en inglés del proveedor (hair, growth, cream, pain relief…).",
    "- Primero qué es el producto; después para qué sirve («para…», «contra…», «alivio de…»).",
    "- Si es un suplemento, di cuántas cápsulas, gomitas o tabletas trae, solo si la cantidad aparece en los datos: no inventes cantidades.",
    "- Sin promesas médicas que no se puedan cumplir («cura», «elimina para siempre»).",
    "- Mínimo 3 palabras. Sin MAYÚSCULAS sostenidas, emojis, signos de exclamación ni punto final.",
    "- Que las opciones sean distintas entre sí (otro enfoque o beneficio), no la misma frase reordenada.",
    "",
    'Responde solo este JSON: {"sugerencias":[{"titulo":"…","porque":"una frase corta de por qué ese título vende mejor"}]}',
  ].join("\n");
  return { sistema, usuario };
}

/** Sin espacios de más, comillas alrededor ni punto o exclamación al final (en cualquier orden: «Título».). */
const limpiar = (t: string) =>
  t
    .replace(/\s+/g, " ")
    .replace(/^[\s"«“'`]+|[\s"»”'`.!¡]+$/g, "")
    .trim();

/**
 * Lee la respuesta de Chat Completions (`choices[0].message.content`, un JSON con `sugerencias`) y deja las que entran en Dropi: sin
 * repetir, distintas del título actual, de `max_titulo` caracteres o menos y con 3 palabras o más. Cada una lleva su revisión, y van
 * primero las que cumplen más puntos. `null` si la respuesta no se entiende.
 */
export function leerSugerencias(respuesta: unknown, d: DatosTitulo, reglas: Pick<Reglas, "max_titulo" | "min_fotos" | "min_descripcion">): SugerenciaTitulo[] | null {
  const contenido = (respuesta as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof contenido !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(contenido);
  } catch {
    return null;
  }
  const lista = (json as { sugerencias?: unknown } | null)?.sugerencias;
  if (!Array.isArray(lista)) return null;

  const vistos = new Set([d.titulo.trim().toLowerCase()]);
  const salida: SugerenciaTitulo[] = [];
  for (const s of lista) {
    const crudo = typeof s === "string" ? s : (s as { titulo?: unknown } | null)?.titulo;
    if (typeof crudo !== "string") continue;
    const titulo = limpiar(crudo);
    const clave = titulo.toLowerCase();
    if (!titulo || vistos.has(clave)) continue;
    if (titulo.length > reglas.max_titulo || titulo.split(" ").length < 3) continue;
    vistos.add(clave);
    const porque = typeof s === "object" && s && typeof (s as { porque?: unknown }).porque === "string" ? limpiar((s as { porque: string }).porque).slice(0, 200) : "";
    const revisiones = revisarTitulo(titulo, reglas);
    const evaluables = revisiones.filter((r) => r.estado !== "no_aplica" && r.estado !== "sin_datos");
    salida.push({ titulo, porque, revisiones, cumple: evaluables.filter((r) => r.estado === "ok").length, total: evaluables.length });
  }
  // Estable: a igual cumplimiento, el orden de la IA.
  return salida.map((s, i) => ({ s, i })).sort((a, b) => b.s.cumple / b.s.total - a.s.cumple / a.s.total || a.i - b.i).map(({ s }) => s).slice(0, OPCIONES_PEDIDAS);
}

/** El aviso para la ficha cuando OpenAI responde con error (sin mostrar la respuesta, que puede traer datos de la cuenta). */
export function errorOpenAI(estado: number): string {
  if (estado === 401) return "La clave de ChatGPT no es válida: revísala en Vercel (OPENAI_API_KEY).";
  if (estado === 429) return "ChatGPT no respondió: la cuenta de OpenAI se quedó sin saldo o hubo muchos pedidos seguidos. Prueba en un momento.";
  if (estado === 404) return "El modelo de ChatGPT configurado no existe (OPENAI_MODEL en Vercel).";
  return `ChatGPT no pudo responder (error ${estado}). Prueba otra vez.`;
}
