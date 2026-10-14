import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta firma cada aviso del webhook con el secreto de la app: la cabecera `X-Hub-Signature-256` trae `sha256=` y el HMAC
 * del cuerpo **tal como llegó** (no del JSON ya leído). Sin esta revisión cualquiera podría mandar avisos falsos a la
 * dirección del webhook y llenar la base. Se compara en tiempo constante; sin secreto configurado nunca se acepta.
 */
export function firmaValida(cuerpoCrudo: string, cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || !cabecera || !cabecera.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", secreto).update(cuerpoCrudo, "utf8").digest("hex"), "utf8");
  const recibido = Buffer.from(cabecera.slice("sha256=".length), "utf8");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** El token que se escribe en el panel de Meta al registrar el webhook (la verificación `GET` lo manda de vuelta). */
export function tokenDeVerificacionValido(recibido: string | null, esperado: string | undefined): boolean {
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
