// Imágenes de la landing con Gemini (21 oct 2026): cómo se arma el pedido y cómo se lee la respuesta, sin red para poder
// probarlo. La llamada vive en `gemini-api.ts` (solo servidor).

import { ESPACIOS_IMAGEN, etiquetaAngulo, type EspacioImagen } from "./landing";

/** El modelo por defecto (se cambia con `GEMINI_IMAGE_MODEL`). Cuesta unos US$0,034 por imagen de 1K. */
export const MODELO_IMAGEN = "gemini-nano-banana-2.1";

/** Proporción de cada espacio: la imagen en uso va vertical (se ve mejor en el celular); el resto, cuadradas. */
export const PROPORCION: Record<EspacioImagen, string> = { portada: "1:1", detalle: "1:1", en_uso: "4:5", variantes: "1:1", empaque: "1:1" };

/** Cuántas fotos de referencia se mandan como máximo (el modelo acepta más, pero suben el costo y el tiempo). */
export const MAX_REFERENCIAS = 4;

/** El texto del pedido: la instrucción del espacio y lo que debe respetar (el producto igual al de las fotos, sin textos). */
export function armarPromptImagen(datos: { espacio: EspacioImagen; instruccion: string; nombre: string; angulo: string; notas: string | null; referencias: number }): string {
  const espacio = ESPACIOS_IMAGEN.find((e) => e.clave === datos.espacio)!;
  const lineas = [
    `Imagen para la landing de una tienda en línea. Producto: ${datos.nombre.trim()}.`,
    `Uso en la página: ${espacio.etiqueta}. Ángulo de venta: ${etiquetaAngulo(datos.angulo)}.`,
    `Lo que debe mostrar: ${datos.instruccion.trim() || espacio.instruccion}`,
  ];
  if (datos.referencias)
    lineas.push(
      `Las ${datos.referencias === 1 ? "imagen adjunta es una foto real" : `${datos.referencias} imágenes adjuntas son fotos reales`} del producto: respeta exactamente su forma, colores, materiales, proporciones y detalles. No inventes otro producto ni cambies su diseño.`,
    );
  if (datos.notas?.trim()) lineas.push(`Indicaciones del equipo: ${datos.notas.trim()}`);
  lineas.push("Fotografía realista de calidad comercial, bien iluminada. Sin textos, letras, logos, marcas de agua, precios ni sellos sobre la imagen.");
  return lineas.join("\n");
}

/** El cuerpo del pedido a la API de Interactions de Gemini. */
export function cuerpoPedido(modelo: string, prompt: string, referencias: { mime: string; base64: string }[], proporcion: string) {
  return {
    model: modelo,
    input: [{ type: "text", text: prompt }, ...referencias.map((r) => ({ type: "image", mime_type: r.mime, data: r.base64 }))],
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: proporcion, image_size: "1K" },
  };
}

export type RespuestaImagen = { base64: string; mime: string } | { error: string };

/**
 * Saca la imagen de la respuesta. Gemini puede devolver varias (las «de pensamiento» intermedias van antes): vale la última.
 * Se busca en toda la respuesta cualquier bloque `{ type: "image", data }` (también la forma `inlineData` de generateContent),
 * así un cambio menor en el formato no la rompe. Sin imagen, devuelve el motivo que dé Gemini.
 */
export function extraerImagen(json: unknown): RespuestaImagen {
  let ultima: { base64: string; mime: string } | null = null;
  let texto: string | null = null;
  const visitar = (v: unknown, prof: number) => {
    if (!v || typeof v !== "object" || prof > 12) return;
    if (Array.isArray(v)) return v.forEach((x) => visitar(x, prof + 1));
    const o = v as Record<string, unknown>;
    const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === "string") ultima = { base64: inline.data, mime: String(inline.mimeType ?? inline.mime_type ?? "image/png") };
    else if (o.type === "image" && typeof o.data === "string" && o.data.length > 100) ultima = { base64: o.data, mime: String(o.mime_type ?? o.mimeType ?? "image/png") };
    else if (o.type === "text" && typeof o.text === "string") texto = o.text;
    for (const [k, x] of Object.entries(o)) if (k !== "data") visitar(x, prof + 1);
  };
  const raiz = json as Record<string, unknown> | null;
  const error = raiz && typeof raiz.error === "object" && raiz.error ? (raiz.error as Record<string, unknown>) : null;
  if (error) return { error: mensajeError(Number(error.code), String(error.message ?? "")) };
  visitar(json, 0);
  if (ultima) return ultima;
  return { error: texto ? `Gemini no devolvió imagen: ${String(texto).slice(0, 200)}` : "Gemini no devolvió ninguna imagen. Prueba cambiando la instrucción." };
}

/** Un error de la API en palabras de quien usa el sistema. */
export function mensajeError(codigo: number, mensaje: string): string {
  if (codigo === 400 && /api key/i.test(mensaje)) return "La clave de Gemini no es válida.";
  if (codigo === 401 || codigo === 403) return "Gemini rechazó la clave: revisa que sea válida y tenga la facturación activa.";
  if (codigo === 429) return "Se alcanzó el límite de Gemini por ahora. Espera un minuto y vuelve a intentar.";
  if (codigo === 404) return "El modelo de imágenes de Gemini no está disponible para esta clave.";
  if (codigo >= 500) return "Gemini no respondió. Vuelve a intentar en un momento.";
  return `Gemini rechazó el pedido${mensaje ? `: ${mensaje.slice(0, 200)}` : "."}`;
}
