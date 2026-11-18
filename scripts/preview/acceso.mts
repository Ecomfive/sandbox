// Quién puede hablarle al PostgREST falso de la vista previa (auditoría de seguridad, 18 nov 2026: hallazgo
// «crearServidor-no-host-allowlist»). La base lleva los Excel de datos-privados/ (libro, nómina, bancos), así que:
//   - escucha solo en 127.0.0.1 (nadie de la red llega),
//   - responde solo si la dirección pedida (cabecera Host) es localhost o 127.0.0.1 con su puerto: una página de internet
//     que use DNS rebinding manda su propio dominio en Host y recibe 403,
//   - y cada petición trae en `apikey` la clave de esta corrida (la genera levantar.sh y la reciben la app y los
//     importadores por .env.preview, como antes la clave fija «preview»). Un pedido a ciegas desde otra página (un
//     `fetch` no-cors o un formulario) no puede poner esa cabecera.
import { createHash, timingSafeEqual } from "node:crypto";

/** La única dirección en la que escucha el servidor. */
export const HOST_ESCUCHA = "127.0.0.1";

/** Largo mínimo de la clave (en caracteres): la de levantar.sh tiene 64 (32 bytes en hex). */
export const LARGO_MINIMO_CLAVE = 32;

/** Si la cabecera Host es la de este equipo con el puerto del servidor. */
export function hostPermitido(host: string | undefined, puerto: number): boolean {
  if (!host || !Number.isInteger(puerto) || puerto <= 0) return false;
  const h = host.trim().toLowerCase();
  return h === `localhost:${puerto}` || h === `127.0.0.1:${puerto}`;
}

/**
 * Si la clave recibida es la de la corrida. Compara los resúmenes SHA-256 con `timingSafeEqual` (mismo largo siempre, así
 * que el tiempo no dice cuánto de la clave coincide ni qué largo tiene).
 */
export function claveValida(recibida: unknown, esperada: string): boolean {
  if (typeof recibida !== "string" || recibida.length === 0 || esperada.length < LARGO_MINIMO_CLAVE) return false;
  const a = createHash("sha256").update(recibida).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

/** El motivo para rechazar una petición, o null si pasa. Primero la dirección (403) y después la clave (401). */
export function rechazo(
  cabeceras: { host?: string; apikey?: string | string[] },
  puerto: number,
  clave: string,
): { status: 401 | 403; mensaje: string } | null {
  if (!hostPermitido(cabeceras.host, puerto)) return { status: 403, mensaje: `Solo desde http://127.0.0.1:${puerto}` };
  if (!claveValida(cabeceras.apikey, clave)) return { status: 401, mensaje: "Falta la clave de la vista previa (apikey)" };
  return null;
}
