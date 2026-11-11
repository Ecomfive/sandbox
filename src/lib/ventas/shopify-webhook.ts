// Webhooks de Shopify (orders/create, orders/updated, orders/cancelled, orders/paid): firma, temas y salud de la conexión.
// Prueba en `shopify-webhook.test.ts`.

import { createHmac, timingSafeEqual } from "node:crypto";

export const TEMAS_ORDEN = ["orders/create", "orders/updated", "orders/cancelled", "orders/paid", "orders/edited"] as const;

/** `X-Shopify-Hmac-Sha256`: HMAC-SHA256 del cuerpo crudo con el secreto de la app, en base64. Sin secreto, nada pasa. */
export function firmaShopifyValida(cuerpo: string, cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || !cabecera) return false;
  const esperado = createHmac("sha256", secreto).update(cuerpo, "utf8").digest();
  let recibido: Buffer;
  try { recibido = Buffer.from(cabecera.trim(), "base64"); } catch { return false; }
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export type TonoSalud = "ok" | "aviso" | "error";
export interface SaludConexion { tono: TonoSalud; texto: string }

const HORAS = 3_600_000;

/**
 * Cómo está la conexión de una tienda: error del último intento > sin lecturas > lectura vieja.
 * Con webhooks vivos la lectura puede ser más espaciada (el cron la rellena), así que se tolera más.
 */
export function saludConexion(c: { activa: boolean; error: string | null; ultimaLectura: string | null; ultimoWebhook: string | null }, ahoraMs: number = Date.now()): SaludConexion {
  if (!c.activa) return { tono: "aviso", texto: "Sin conectar" };
  if (c.error) return { tono: "error", texto: "Falló la última lectura" };
  const t = (v: string | null) => (v ? Date.parse(v) : NaN);
  const lectura = t(c.ultimaLectura);
  const hook = t(c.ultimoWebhook);
  if (Number.isNaN(lectura) && Number.isNaN(hook)) return { tono: "aviso", texto: "Sin lecturas todavía" };
  const reciente = Math.max(Number.isNaN(lectura) ? 0 : lectura, Number.isNaN(hook) ? 0 : hook);
  const horas = (ahoraMs - reciente) / HORAS;
  if (horas > 12) return { tono: "error", texto: `Sin datos hace ${Math.floor(horas)} h` };
  if (horas > 3) return { tono: "aviso", texto: `Sin datos hace ${Math.floor(horas)} h` };
  return { tono: "ok", texto: Number.isNaN(hook) ? "Al día" : "Al día · webhooks activos" };
}

/** Días hacia atrás permitidos al rellenar huecos. */
export function diasRelleno(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 60) : 7;
}
