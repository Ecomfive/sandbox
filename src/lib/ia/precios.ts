// Consumo de IA (22 oct 2026): cuánto cuesta cada uso de las dos claves del sistema, OpenAI (texto) y Gemini (imágenes). Ninguna de las
// dos APIs devuelve el costo en dólares: se **estima** con los tokens que sí devuelve OpenAI y con un precio fijo por imagen de Gemini.
// Los precios son los públicos de cada proveedor y se pueden corregir aquí (o con las variables de entorno de abajo) cuando cambien.
// Sin base ni React, con prueba.

export type ProveedorConsumo = "openai" | "gemini" | "anthropic";

export const ETIQUETA_PROVEEDOR: Record<ProveedorConsumo, string> = { openai: "OpenAI", gemini: "Gemini", anthropic: "Claude" };

/** Dólares por millón de tokens (entrada, salida), por familia de modelo. El primero que coincida con el nombre del modelo. */
const PRECIOS_TEXTO: { patron: RegExp; entrada: number; salida: number }[] = [
  { patron: /^gpt-5-nano/i, entrada: 0.05, salida: 0.4 },
  { patron: /^gpt-5-mini/i, entrada: 0.25, salida: 2 },
  { patron: /^gpt-5/i, entrada: 1.25, salida: 10 },
  { patron: /^gpt-4\.1-nano/i, entrada: 0.1, salida: 0.4 },
  { patron: /^gpt-4\.1-mini/i, entrada: 0.4, salida: 1.6 },
  { patron: /^gpt-4\.1/i, entrada: 2, salida: 8 },
  { patron: /^gpt-4o-mini/i, entrada: 0.15, salida: 0.6 },
  { patron: /^gpt-4o/i, entrada: 2.5, salida: 10 },
  { patron: /^o4-mini/i, entrada: 1.1, salida: 4.4 },
  { patron: /^o3/i, entrada: 2, salida: 8 },
  { patron: /haiku/i, entrada: 1, salida: 5 },
  { patron: /opus/i, entrada: 15, salida: 75 },
  { patron: /sonnet/i, entrada: 3, salida: 15 },
];
/** Un modelo que no se conoce se cobra como uno caro (más vale pasarse que avisar tarde). */
const PRECIO_DESCONOCIDO = { entrada: 2.5, salida: 10 };

/** Lo que cobra cada búsqueda en internet (la herramienta web_search): 10 dólares por mil. */
export const PRECIO_BUSQUEDA = 0.01;

export interface UsoTexto {
  tokensEntrada: number;
  tokensSalida: number;
  busquedas: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** El costo estimado en dólares de una respuesta de texto. */
export function costoTexto(modelo: string, uso: UsoTexto): number {
  const p = PRECIOS_TEXTO.find((x) => x.patron.test(modelo)) ?? PRECIO_DESCONOCIDO;
  return r4((uso.tokensEntrada * p.entrada + uso.tokensSalida * p.salida) / 1e6 + uso.busquedas * PRECIO_BUSQUEDA);
}

/**
 * El costo estimado de transcribir un audio (30 oct 2026): ni OpenAI ni Gemini dicen los minutos, así que se calculan con el tamaño (una nota de voz de
 * WhatsApp pesa unos 150 KB por minuto) y la tarifa por minuto del modelo: `gpt-4o-mini-transcribe` 0,003, `whisper` y `gpt-4o-transcribe` 0,006 y Gemini
 * (tokens de audio) alrededor de 0,001. Es una estimación para el saldo de «Consumo de IA».
 */
export function costoTranscripcion(modelo: string, bytes: number): number {
  const minutos = Math.max(0, bytes) / 150_000;
  const tarifa = /gemini/i.test(modelo) ? 0.001 : /mini/i.test(modelo) ? 0.003 : 0.006;
  return r4(minutos * tarifa);
}

/**
 * Lo que cuesta una imagen de Gemini de 1K: unos 0,034 dólares en el modelo por defecto y 0,134 en los «Pro». Se corrige con
 * `GEMINI_IMAGE_PRICE_USD` si el modelo o la tarifa cambian.
 */
export function costoImagen(modelo: string, precioEntorno?: string | null): number {
  const forzado = Number(precioEntorno);
  if (Number.isFinite(forzado) && forzado > 0) return r4(forzado);
  return /pro/i.test(modelo) ? 0.134 : 0.034;
}
