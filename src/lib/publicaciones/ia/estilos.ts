// Imágenes modelo del Asistente de IA (22 oct 2026): el equipo sube imágenes que le gustan, la IA las analiza y **solo se guarda el análisis
// como texto** (una guía de estilo: composición, colores, luz, elementos gráficos). Esa guía se agrega al pedido de cada foto que genera
// Gemini, así las fotos se parecen al estilo de Ecomfive sin guardar ni copiar las imágenes. Sin base ni red, con prueba.

import { detectarImagen } from "@/lib/seguridad/imagen";
import { conTexto } from "./fotos-base";
import { extraerJson } from "./openai";

/** Una guía de estilo guardada. `tipo` es «general» (vale para toda foto) o un tipo de foto del plan (beneficios, uso…). */
export interface EstiloImagen {
  id: string;
  nombre: string;
  tipo: string;
  guia: string;
  activo: boolean;
}

export const TIPO_GENERAL = "general";
export const MAX_IMAGENES_MODELO = 3;
/** Cada imagen llega ya reducida desde el navegador (el límite de una acción del servidor es 1 MB en total). */
export const MAX_BYTES_IMAGEN_MODELO = 180_000;
export const MAX_GUIA = 1500;
/** Cuántas guías se agregan a un pedido: las más nuevas que valen para esa foto. */
const MAX_EN_PEDIDO = 3;

const cortar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Una imagen que manda el navegador como `data:image/...;base64,...`: se decodifica, se comprueba **por su firma** (no por lo que diga el
 * tipo) y se vuelve a armar con el tipo real. GIF no: la IA no lo necesita. Devuelve el error en palabras o la imagen lista para la IA.
 */
export function leerImagenModelo(dataUrl: unknown): { dataUrl: string; bytes: number } | { error: string } {
  if (typeof dataUrl !== "string") return { error: "Una de las imágenes no es válida." };
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) return { error: "Una de las imágenes no es válida." };
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.length > MAX_BYTES_IMAGEN_MODELO) return { error: "Una de las imágenes pesa demasiado. Elige otra o una más pequeña." };
  const tipo = detectarImagen(bytes.slice(0, 64));
  if (!tipo || tipo.tipo === "image/gif") return { error: "Solo se aceptan imágenes JPG, PNG o WebP." };
  return { dataUrl: `data:${tipo.tipo};base64,${m[1]}`, bytes: bytes.length };
}

/** El pedido para analizar las imágenes modelo y escribir la guía. La IA ve las imágenes; no se le pide transcribir ni copiar nada. */
export function pedidoEstiloImagen(etiquetaTipo: string | null, cantidad: number): { instrucciones: string; texto: string } {
  const instrucciones = [
    "Eres director de arte de publicaciones de productos para marketplaces de dropshipping.",
    "Te paso imágenes modelo que al equipo le gustan. Tu trabajo es describir su ESTILO VISUAL en español, para que otro modelo de imágenes pueda crear fotos nuevas con el mismo estilo sin copiarlas.",
    [
      "Reglas:",
      "- Describe lo que se repite en las imágenes (si hay varias): composición y encuadre, fondo y colores (nombra los tonos), iluminación, elementos gráficos (íconos, formas, flechas, marcos) y cómo se reparte el espacio.",
      "- Si las imágenes llevan texto, NO lo transcribas ni lo copies: describe solo dónde va y cómo se organiza (por ejemplo «columna de 4 beneficios con ícono a la izquierda»).",
      "- No describas el producto concreto, ni marcas, logos, personas reconocibles ni precios.",
      "- Sé concreto y breve: cada campo, una o dos frases.",
      "- Dime también qué evitar para no salirse de ese estilo.",
    ].join("\n"),
    'Responde SOLO con un JSON, sin texto antes ni después: {"estilo":"…","composicion":"…","colores":"…","luz":"…","elementos":"…","distribucion_texto":"…","evitar":"…"}. Si algún campo no aplica, déjalo vacío.',
  ].join("\n\n");
  const texto = `${cantidad === 1 ? "Imagen modelo adjunta" : `${cantidad} imágenes modelo adjuntas`}${etiquetaTipo ? `, para fotos de tipo «${etiquetaTipo}»` : ", para cualquier tipo de foto"}. Escribe la guía de estilo.`;
  return { instrucciones, texto };
}

const CAMPOS_GUIA: [clave: string, etiqueta: string, max: number][] = [
  ["estilo", "Estilo", 300],
  ["composicion", "Composición", 300],
  ["colores", "Colores y fondo", 300],
  ["luz", "Luz", 200],
  ["elementos", "Elementos gráficos", 300],
  ["distribucion_texto", "Reparto del espacio para texto", 300],
  ["evitar", "Evitar", 300],
];

/** Lo que devolvió la IA vuelto una guía de texto, una línea por campo («Colores y fondo: …»). null si no dijo casi nada. */
export function normalizarEstilo(texto: string): string | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const lineas = CAMPOS_GUIA.map(([clave, etiqueta, max]) => {
    const v = cortar(o[clave], max);
    return v ? `${etiqueta}: ${v}` : "";
  }).filter(Boolean);
  if (lineas.length < 2) return null;
  return lineas.join("\n").slice(0, MAX_GUIA);
}

/** Las guías que valen para una foto: las «generales» y las de su tipo, de las más nuevas (la lista viene de más nueva a más vieja). */
export function elegirEstilos(estilos: EstiloImagen[], tipo?: string): EstiloImagen[] {
  return estilos.filter((e) => e.activo && e.guia.trim() && (tipo === undefined || e.tipo === TIPO_GENERAL || e.tipo === tipo)).slice(0, MAX_EN_PEDIDO);
}

/** El bloque que se agrega al pedido de una foto o de un plan de fotos. Vacío si no hay guías. */
export function textoEstilos(estilos: EstiloImagen[] | undefined, tipo?: string): string {
  const elegidos = elegirEstilos(estilos ?? [], tipo);
  if (!elegidos.length) return "";
  return [
    `Estilo visual del equipo (sacado de imágenes modelo que aprobó): imítalo en composición, colores, luz y elementos gráficos, sin copiar sus textos, logos ni productos. ${
      tipo !== undefined && conTexto(tipo)
        ? "Imita también cómo se reparte y se ve el texto (jerarquía, íconos, espacios), pero escribe solo el texto que se te indica."
        : "La imagen que generes no lleva letras: si el estilo las usa, deja ese espacio limpio."
    }`,
    ...elegidos.map((e) => `«${e.nombre}»\n${e.guia.trim()}`),
  ].join("\n\n");
}
