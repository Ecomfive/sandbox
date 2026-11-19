// Límite del login y de «contraseña actual» (seguridad · 19 nov 2026). Antes de probar la clave se SUMA el intento (en la base, sin
// carreras: diez pedidos a la vez cuentan diez) a tres cuentas: correo + IP, IP y correo solo; si alguna pasó su tope, ni se le pregunta a
// Supabase. Si la clave era correcta (o Supabase no respondió), el intento se devuelve: solo quedan los fallidos. El freno fuerte es por
// correo + IP; por correo solo el tope es alto (50) para que nadie pueda dejar afuera a otra persona desde su propia IP, y a los 10 fallos
// se avisa. Solo servidor: NO es un archivo "use server". Números en `LIMITES` (limite-reglas.ts).

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { avisoIngresoCorreo, avisoIngresoIp } from "./avisos-seguridad-reglas";
import { avisarSeguridad } from "./avisos-seguridad";
import { devolverUna, ipDeLaPeticion, reiniciarLimite, sumarUna } from "./limite";
import { claveLimite, esClaveEquivocada, frenaIngreso, LIMITES, llegoAlMaximo, normalizarCorreo, pareceCorreo, type CuentasIngreso } from "./limite-reglas";

export interface IntentoIngreso {
  /** El correo, solo si tiene forma de correo (si no, vacío: no se cuenta por correo ni se nombra en un aviso). */
  correo: string;
  ip: string | null;
  claveCorreoIp: string | null;
  claveIp: string | null;
  claveCorreo: string | null;
  cuentas: CuentasIngreso;
}

/** Suma el intento a sus cuentas y dice si ya está frenado. Ante una falla de la base, no frena (esas cuentas quedan en null). */
export async function revisarIngreso(correoEscrito: unknown): Promise<{ intento: IntentoIngreso; frenado: boolean }> {
  const normalizado = normalizarCorreo(correoEscrito);
  const correo = pareceCorreo(normalizado) ? normalizado : "";
  const ip = await ipDeLaPeticion();
  const claveCorreoIp = correo ? claveLimite("login-correo-ip", correo, ip ?? "sin-ip") : null;
  const claveIp = ip ? claveLimite("login-ip", ip) : null;
  const claveCorreo = correo ? claveLimite("login-correo", correo) : null;
  const [correoIp, porIp, porCorreo] = await Promise.all([
    claveCorreoIp ? sumarUna(claveCorreoIp, LIMITES.loginCorreoIp.ventana) : null,
    claveIp ? sumarUna(claveIp, LIMITES.loginIp.ventana) : null,
    claveCorreo ? sumarUna(claveCorreo, LIMITES.loginCorreo.ventana) : null,
  ]);
  const cuentas: CuentasIngreso = { correoIp, ip: porIp, correo: porCorreo };
  return { intento: { correo, ip, claveCorreoIp, claveIp, claveCorreo, cuentas }, frenado: frenaIngreso(cuentas) };
}

/** El nombre de la cuenta del equipo con ese correo (solo para el aviso a quien administra), o null. */
async function cuentaDelCorreo(correo: string): Promise<string | null> {
  try {
    // Los correos se guardan en minúsculas (Usuarios y roles los normaliza al crear y al editar).
    const { data } = await createServiceClient().from("perfiles").select("nombre, email").eq("email", correo).limit(1).maybeSingle();
    return data ? String(data.nombre || data.email).slice(0, 120) : null;
  } catch {
    return null;
  }
}

/** Una clave equivocada: el intento ya quedó sumado; si con él se llegó a un tope, avisa. Nunca lanza. */
async function anotarFallo(intento: IntentoIngreso): Promise<void> {
  try {
    const { cuentas } = intento;
    const avisos: Promise<void>[] = [];
    // Por correo: al frenarse desde una IP, o a los 10 fallos sumando todas las IP (un solo aviso por correo y hora).
    const variasIp = llegoAlMaximo(cuentas.correo, LIMITES.loginCorreoAviso);
    if (intento.correo && (variasIp || llegoAlMaximo(cuentas.correoIp, LIMITES.loginCorreoIp))) {
      const cuenta = await cuentaDelCorreo(intento.correo);
      const regla = variasIp ? LIMITES.loginCorreoAviso : LIMITES.loginCorreoIp;
      avisos.push(avisarSeguridad({ motivo: "ingreso_correo", asunto: [intento.correo], ...avisoIngresoCorreo({ correo: intento.correo, ip: intento.ip, cuenta, regla, variasIp }) }));
    }
    if (intento.ip && llegoAlMaximo(cuentas.ip, LIMITES.loginIp)) {
      avisos.push(avisarSeguridad({ motivo: "ingreso_ip", asunto: [intento.ip], ...avisoIngresoIp({ ip: intento.ip, regla: LIMITES.loginIp }) }));
    }
    await Promise.all(avisos);
  } catch (e) {
    console.error("[limite-ingreso] no se pudo avisar el fallo", e);
  }
}

/** Devuelve el intento a sus cuentas; con la clave correcta, además, la de ese correo desde esa IP vuelve a cero. */
async function devolver(intento: IntentoIngreso, correcta: boolean): Promise<void> {
  await Promise.all([
    intento.claveCorreoIp ? (correcta ? reiniciarLimite(intento.claveCorreoIp) : devolverUna(intento.claveCorreoIp, LIMITES.loginCorreoIp.ventana)) : null,
    intento.claveIp ? devolverUna(intento.claveIp, LIMITES.loginIp.ventana) : null,
    intento.claveCorreo ? devolverUna(intento.claveCorreo, LIMITES.loginCorreo.ventana) : null,
  ]);
}

/**
 * Después de probar la clave, con el error de Supabase (null = correcta): correcta, se devuelve; equivocada, queda contada y quizás avisa;
 * otra falla (Supabase caído, su propio límite), se devuelve. Nunca lanza.
 */
export async function cerrarIntento(intento: IntentoIngreso, error: unknown): Promise<void> {
  try {
    if (error && esClaveEquivocada(error)) await anotarFallo(intento);
    else await devolver(intento, !error);
  } catch (e) {
    console.error("[limite-ingreso] no se pudo cerrar el intento", e);
  }
}
