// Buscar por imagen: los pedidos a la IA con visión (la misma OpenAI o Claude del Asistente de IA, `pedirIA`) y cómo se lee lo que responde. Sin red, con prueba.
// Todo lo que devuelve la IA se vuelve a validar (veredictos de una lista, motivos cortos): nunca se confía en su forma.

import { extraerJson } from "@/lib/publicaciones/ia/openai";
import type { EntradaTexto } from "@/lib/publicaciones/ia/openai";
import type { Veredicto } from "./buscar";

/** Cuántas fotos de candidatos se le muestran a la IA de una vez (más sube el costo y la confunde). */
export const MAX_CANDIDATOS_IA = 10;

/** 1.er pedido: qué producto es la foto y con qué palabras se llamaría en una tienda. */
export function pedidoDescribir(imagen: string): EntradaTexto {
  return {
    instrucciones:
      "Eres un catalogador de productos de ecommerce y dropshipping en Latinoamérica. Miras la foto de un producto y dices qué es, con las palabras con que se " +
      "vendería en una tienda en español. Respondes SOLO un JSON, sin texto antes ni después.",
    texto:
      'Mira la foto y responde: {"producto":"qué es, en pocas palabras (ej. limpiador a vapor portátil)","palabras":["4 a 8 palabras clave en español para encontrarlo por nombre, ' +
      'de lo más específico a lo más general (ej. limpiador, vapor, portátil, alta presión)"],"seguro":true}. "seguro" es false si la foto no deja ver bien un producto ' +
      "(collage, captura de pantalla, varios productos, solo texto).",
    imagenes: [imagen],
  };
}

export interface Descripcion {
  producto: string;
  palabras: string[];
  seguro: boolean;
}

export function leerDescripcion(texto: string): Descripcion | null {
  const j = extraerJson(texto) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const producto = typeof j.producto === "string" ? j.producto.trim().slice(0, 120) : "";
  const palabras = (Array.isArray(j.palabras) ? j.palabras : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
  if (!producto && !palabras.length) return null;
  return { producto, palabras: palabras.length ? palabras : [producto], seguro: j.seguro !== false };
}

/** 2.º pedido: compara la foto buscada con las de los candidatos (la primera imagen es la buscada; las demás, los candidatos en orden). */
export function pedidoVerificar(imagenBuscada: string, candidatos: { nombre: string; foto: string }[]): EntradaTexto {
  const lista = candidatos.map((c, i) => `${i + 1}. ${c.nombre}`).join("\n");
  return {
    instrucciones:
      "Eres un revisor de catálogo. Te muestro una foto buscada (la primera imagen) y las fotos de varios productos candidatos (las demás, en el mismo orden de la lista). " +
      "Decides si cada candidato es EL MISMO PRODUCTO que la foto buscada (mismo artículo, aunque cambie el ángulo, el fondo o el empaque), uno PARECIDO (misma clase de " +
      "producto pero otro modelo, color o tamaño) o DISTINTO. Respondes SOLO un JSON, sin texto antes ni después.",
    texto:
      `Candidatos (el n.º es el orden de sus fotos, después de la foto buscada):\n${lista}\n\n` +
      'Responde: {"resultados":[{"n":1,"veredicto":"mismo|parecido|distinto","motivo":"una frase corta que diga en qué se parecen o en qué se distinguen"}]} con todos los candidatos.',
    imagenes: [imagenBuscada, ...candidatos.map((c) => c.foto)],
  };
}

export interface ResultadoVerificado {
  n: number;
  veredicto: Veredicto;
  motivo: string | null;
}

const VEREDICTOS: Veredicto[] = ["mismo", "parecido", "distinto"];

/** Lo que dijo la IA de cada candidato (por su n.º, de 1 a `total`); lo que venga mal formado o repetido se descarta. */
export function leerVerificacion(texto: string, total: number): ResultadoVerificado[] {
  const j = extraerJson(texto) as { resultados?: unknown } | null;
  const lista = Array.isArray(j?.resultados) ? (j!.resultados as unknown[]) : [];
  const vistos = new Set<number>();
  const salida: ResultadoVerificado[] = [];
  for (const x of lista) {
    const r = x as Record<string, unknown>;
    const n = Math.trunc(Number(r?.n));
    const veredicto = String(r?.veredicto ?? "").toLowerCase() as Veredicto;
    if (!Number.isInteger(n) || n < 1 || n > total || vistos.has(n) || !VEREDICTOS.includes(veredicto)) continue;
    vistos.add(n);
    salida.push({ n, veredicto, motivo: typeof r.motivo === "string" && r.motivo.trim() ? r.motivo.trim().slice(0, 160) : null });
  }
  return salida;
}
