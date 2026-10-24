// La descripción de un producto en Dropi (pedido de Jhokser, 24 oct 2026): la IA propone un texto con párrafos y listas; Dropi guarda HTML.
// Aquí se vuelve HTML simple y limpio (párrafos, listas con viñetas), con el texto escapado, y se cuenta cuánto mide como lo cuenta
// Dropi (sin etiquetas). Sin base ni red, con prueba.

import { MIN_DESCRIPCION_DROPI } from "./dropi-guardado";

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VINETA = /^\s*(?:[-•*·])\s+/;

/**
 * Un texto escrito con líneas en blanco entre párrafos y viñetas («- …», «• …») como HTML para Dropi: `<p>` por párrafo (sus saltos de
 * línea son `<br>`) y `<ul><li>` por cada bloque de viñetas. Todo lo escrito se escapa: nunca llega una etiqueta de la persona ni de la IA.
 */
export function descripcionAHtml(texto: string): string {
  const bloques = String(texto ?? "")
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).filter((l) => l.trim() !== ""))
    .filter((b) => b.length > 0);
  return bloques
    .map((lineas) => {
      if (lineas.every((l) => VINETA.test(l))) return `<ul>${lineas.map((l) => `<li>${escapar(l.replace(VINETA, "").trim())}</li>`).join("")}</ul>`;
      return `<p>${lineas.map((l) => escapar(l.trim())).join("<br>")}</p>`;
    })
    .join("");
}

/** El texto de una descripción sin etiquetas (como lo cuenta Dropi). */
export function textoDeDescripcion(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|li|h\d)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuántos caracteres tiene la descripción para Dropi, y si llega al mínimo que pide. */
export function medirDescripcion(html: string): { largo: number; cumple: boolean } {
  const largo = textoDeDescripcion(html).length;
  return { largo, cumple: largo >= MIN_DESCRIPCION_DROPI };
}
