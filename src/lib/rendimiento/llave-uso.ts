import { createHmac, timingSafeEqual } from "node:crypto";
import { secretoPropio } from "@/lib/seguridad/secretos-propios";

// La llave de la extensión «Ecomfive · Uso»: Chrome no le pasa la sesión del sistema a su parte en segundo plano, así que al abrir el sistema recibe esta llave
// firmada, de una persona y por 7 días. Solo sirve para anotar minutos en /api/uso-externo. Sin base ni React, con prueba.

export const DIAS_LLAVE = 7;

const DIA = 86_400_000;
const ES_ID = /^[0-9a-f-]{36}$/;

const firmar = (texto: string, secreto: string) => createHmac("sha256", secreto).update(`uso-externo.${texto}`, "utf8").digest("base64url");

/**
 * Con qué se firman y con qué se aceptan las llaves (auditoría de seguridad, 18 nov 2026). Con `USO_EXTERNO_LLAVE_SECRETO` (32 caracteres o más) se
 * firman con él; las que ya tienen las extensiones, firmadas con la clave de servicio de Supabase, se siguen aceptando (la extensión pide una nueva
 * cada vez que se abre el sistema y la vieja vence a los 7 días), así nadie deja de anotar minutos el día del cambio. Sin la variable, todo sigue con
 * la clave de servicio, como antes.
 */
export function secretosLlaveUso(env: Record<string, string | undefined> = process.env): { firmar: string; aceptar: string[] } {
  const propio = secretoPropio(env.USO_EXTERNO_LLAVE_SECRETO);
  // Tal cual, sin recortar: así firmaba antes y las llaves ya entregadas siguen valiendo.
  const servicio = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { firmar: propio ?? servicio, aceptar: [propio, servicio].filter((s): s is string => !!s) };
}

/** Una llave para una persona, que vence en `DIAS_LLAVE`. */
export function crearLlaveUso(usuarioId: string, secreto: string, ahora = Date.now()): string {
  const texto = `${usuarioId}.${ahora + DIAS_LLAVE * DIA}`;
  return `${texto}.${firmar(texto, secreto)}`;
}

/** De quién es una llave. `null` si está vencida, alterada o no es una llave. Con varios secretos vale la firma de cualquiera (el nuevo va primero). */
export function leerLlaveUso(llave: unknown, secretos: string | string[], ahora = Date.now()): string | null {
  const lista = (Array.isArray(secretos) ? secretos : [secretos]).filter((s) => !!s);
  if (typeof llave !== "string" || !lista.length) return null;
  const [usuarioId, vence, firma, ...resto] = llave.split(".");
  if (resto.length || !firma || !ES_ID.test(usuarioId ?? "") || !/^\d{1,16}$/.test(vence ?? "")) return null;
  const recibida = Buffer.from(firma, "utf8");
  // Se comparan todas en tiempo constante, sin cortar en la primera que coincide.
  let valida = false;
  for (const secreto of lista) {
    const esperada = Buffer.from(firmar(`${usuarioId}.${vence}`, secreto), "utf8");
    if (esperada.length === recibida.length && timingSafeEqual(esperada, recibida)) valida = true;
  }
  if (!valida) return null;
  return Number(vence) > ahora ? usuarioId : null;
}

/** La llave que trae la cabecera `Authorization: Bearer …`. */
export const llaveDeCabecera = (cabecera: string | null) => (cabecera?.startsWith("Bearer ") ? cabecera.slice(7) : null);
