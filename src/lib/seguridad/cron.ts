import { timingSafeEqual } from "node:crypto";

/**
 * ¿La petición trae el secreto de los crons de Vercel (`Authorization: Bearer <CRON_SECRET>`)? Se compara en tiempo
 * constante para que la respuesta no revele cuántos caracteres acertó quien lo prueba. Sin `CRON_SECRET` configurado,
 * nunca se acepta.
 */
export function esPeticionDeCron(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
