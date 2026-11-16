// Confirmación con IA: la contraseña que se pide a quien no es administrador para encender o apagar la confirmación automática (16 nov 2026, pedido de Hernán: «se generará más
// adelante»). Se guarda solo su huella (`scrypt` con sal) y se compara en tiempo constante. Hoy nadie la define todavía: sin huella guardada, quien no es administrador no puede cambiarla.
// Solo servidor, con su prueba.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** La huella de una contraseña, con su sal: `sal:huella` en hexadecimal. */
export function huellaDeClave(clave: string): string {
  const sal = randomBytes(16);
  return `${sal.toString("hex")}:${scryptSync(clave, sal, 32).toString("hex")}`;
}

/** Si la contraseña coincide con la huella guardada. Una huella ausente o mal formada nunca coincide. */
export function claveCoincide(clave: string, huella: string | null | undefined): boolean {
  if (!huella || typeof clave !== "string" || !clave) return false;
  const [sal, esperada] = huella.split(":");
  if (!sal || !esperada || !/^[0-9a-f]+$/i.test(sal) || !/^[0-9a-f]+$/i.test(esperada)) return false;
  const calculada = scryptSync(clave, Buffer.from(sal, "hex"), 32);
  const guardada = Buffer.from(esperada, "hex");
  return guardada.length === calculada.length && timingSafeEqual(calculada, guardada);
}
