// Límite de peticiones contra la base (seguridad · 19 nov 2026, migración 0331). Solo servidor: NO es un archivo "use server".
//
// Si la migración falta o la base falla, se DEJA PASAR (y se anota una vez en los registros del servidor): una falla de la base nunca
// deja a nadie afuera del login. Lo puro (reglas, IP, claves) está en `limite-reglas.ts`.

import "server-only";
import { headers } from "next/headers";
import { esFaltaDeMigracion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ipDeCabeceras, type ReglaLimite } from "./limite-reglas";
import { esFuncionSinMigrar } from "./sesiones";

export { claveLimite, DEMASIADAS_ACCIONES, DEMASIADOS_INTENTOS, LIMITES, normalizarCorreo, type ReglaLimite } from "./limite-reglas";

/** Lo que ya se anotó en los registros (una vez por motivo mientras viva el servidor). */
const anotados = new Set<string>();

function anotarFalla(donde: string, error: unknown) {
  const sinMigrar = esFaltaDeMigracion(error) || esFuncionSinMigrar(error);
  const motivo = sinMigrar ? `${donde}:sin-migracion` : `${donde}:error`;
  if (anotados.has(motivo)) return;
  anotados.add(motivo);
  console.warn(
    sinMigrar ? `[limite] falta correr la migración 0331 (${donde}): se deja pasar todo` : `[limite] la base no respondió (${donde}): se deja pasar`,
    sinMigrar ? "" : error,
  );
}

/** La IP de quien hace la petición (cabeceras de Vercel), o null si no viene. */
export async function ipDeLaPeticion(): Promise<string | null> {
  try {
    const h = await headers();
    return ipDeCabeceras((n) => h.get(n));
  } catch {
    return null;
  }
}

/** Suma una petición a la clave y dice si todavía está dentro del máximo. Ante cualquier falla, true (deja pasar). */
export async function limitar(clave: string, regla: ReglaLimite): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc("limite_peticiones", { p_clave: clave, p_ventana_segundos: regla.ventana, p_maximo: regla.maximo });
    if (error) {
      anotarFalla("limitar", error);
      return true;
    }
    return data !== false;
  } catch (e) {
    anotarFalla("limitar", e);
    return true;
  }
}

/** Cuántas van en la ventana actual, sin sumar. Ante cualquier falla, 0 (deja pasar). */
export async function cuentaEnVentana(clave: string, ventana: number): Promise<number> {
  return (await sumar(clave, ventana, 0)) ?? 0;
}

/** Suma una a la clave y devuelve cuántas van en la ventana actual; null si falló (no se pudo contar). */
export async function sumarUna(clave: string, ventana: number): Promise<number | null> {
  return sumar(clave, ventana, 1);
}

/** Devuelve una (resta sin bajar de 0): el intento no contó (clave correcta, o Supabase no respondió). Nunca lanza. */
export async function devolverUna(clave: string, ventana: number): Promise<void> {
  await sumar(clave, ventana, -1);
}

async function sumar(clave: string, ventana: number, cuanto: -1 | 0 | 1): Promise<number | null> {
  try {
    const { data, error } = await createServiceClient().rpc("limite_sumar", { p_clave: clave, p_ventana_segundos: ventana, p_sumar: cuanto });
    if (error) {
      anotarFalla("contar", error);
      return null;
    }
    return typeof data === "number" ? data : Number(data ?? 0);
  } catch (e) {
    anotarFalla("contar", e);
    return null;
  }
}

/** Vuelve a cero la cuenta de una clave (por ejemplo, los fallos de un correo tras entrar bien). Nunca lanza. */
export async function reiniciarLimite(clave: string): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc("limite_reiniciar", { p_clave: clave });
    if (error) anotarFalla("reiniciar", error);
  } catch (e) {
    anotarFalla("reiniciar", e);
  }
}
