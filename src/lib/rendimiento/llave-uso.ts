import { createHmac, timingSafeEqual } from "node:crypto";

// La llave de la extensión «Ecomfive · Uso»: Chrome no le pasa la sesión del sistema a su parte en segundo plano, así que al abrir el sistema recibe esta llave
// firmada, de una persona y por 7 días. Solo sirve para anotar minutos en /api/uso-externo. Sin base ni React, con prueba.

export const DIAS_LLAVE = 7;

const DIA = 86_400_000;
const ES_ID = /^[0-9a-f-]{36}$/;

const firmar = (texto: string, secreto: string) => createHmac("sha256", secreto).update(`uso-externo.${texto}`, "utf8").digest("base64url");

/** Una llave para una persona, que vence en `DIAS_LLAVE`. */
export function crearLlaveUso(usuarioId: string, secreto: string, ahora = Date.now()): string {
  const texto = `${usuarioId}.${ahora + DIAS_LLAVE * DIA}`;
  return `${texto}.${firmar(texto, secreto)}`;
}

/** De quién es una llave. `null` si está vencida, alterada o no es una llave. */
export function leerLlaveUso(llave: unknown, secreto: string, ahora = Date.now()): string | null {
  if (typeof llave !== "string" || !secreto) return null;
  const [usuarioId, vence, firma, ...resto] = llave.split(".");
  if (resto.length || !firma || !ES_ID.test(usuarioId ?? "") || !/^\d{1,16}$/.test(vence ?? "")) return null;
  const esperada = Buffer.from(firmar(`${usuarioId}.${vence}`, secreto), "utf8");
  const recibida = Buffer.from(firma, "utf8");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return Number(vence) > ahora ? usuarioId : null;
}

/** La llave que trae la cabecera `Authorization: Bearer …`. */
export const llaveDeCabecera = (cabecera: string | null) => (cabecera?.startsWith("Bearer ") ? cabecera.slice(7) : null);
