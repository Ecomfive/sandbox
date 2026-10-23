// Portal del proveedor: qué textos escritos por personas hay que traducir y cómo se le pide a Gemini (lógica pura; la llamada y el
// guardado están en traducir.ts). Shen Zhen ve en chino simplificado los nombres de productos y las notas de Ecomfive; Ecomfive ve en español
// lo que escribe Shen Zhen.

export type Idioma = "zh" | "es";

const CHINO = /[㐀-鿿豈-﫿]/;
const LETRAS = /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/;

/** Si un texto necesita traducción a `destino`: al chino, si tiene palabras en letras latinas; al español, si tiene caracteres chinos. */
export function necesitaTraduccion(texto: string | null | undefined, destino: Idioma): texto is string {
  const t = (texto ?? "").trim();
  if (!t || t.length > 2000) return false;
  return destino === "zh" ? LETRAS.test(t) && !CHINO.test(t) : CHINO.test(t);
}

/** El pedido a Gemini: un arreglo JSON de textos y la respuesta, otro arreglo del mismo largo y en el mismo orden. */
export function promptTraduccion(textos: string[], destino: Idioma): string {
  const idioma = destino === "zh" ? "chino simplificado (简体中文)" : "español neutro";
  return [
    `Traduce cada texto del arreglo JSON al ${idioma}.`,
    "Son nombres de productos y notas de órdenes de compra entre una empresa de comercio electrónico y su proveedor en China.",
    "Reglas: conserva sin traducir los números, cantidades, medidas, unidades, porcentajes, códigos (como ECOM01-0384 o OC-1160), marcas y nombres comerciales;",
    "traduce de forma natural y breve, sin explicar nada; si un texto ya está en el idioma pedido, devuélvelo igual.",
    "Responde solo con un arreglo JSON de cadenas, del mismo largo y en el mismo orden.",
    "",
    JSON.stringify(textos),
  ].join("\n");
}

/** Lee la respuesta de Gemini (`generateContent`): el arreglo traducido, o null si no tiene la forma pedida. */
export function leerTraduccion(respuesta: unknown, esperados: number): string[] | null {
  const partes = (respuesta as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)?.candidates?.[0]?.content?.parts ?? [];
  const texto = partes.map((p) => p.text ?? "").join("").trim();
  if (!texto) return null;
  let valor: unknown;
  try {
    valor = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  if (!Array.isArray(valor) || valor.length !== esperados || !valor.every((v) => typeof v === "string")) return null;
  return (valor as string[]).map((v) => v.trim());
}
