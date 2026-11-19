"use server";

import { getDosPasos, getUsuarioIdSesion, type DosPasosSesion } from "@/lib/auth";
import { factorVerificado, limpiarCodigo, qrComoImagen } from "@/lib/seguridad/dos-pasos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { limitar } from "@/lib/seguridad/limite";
import { DEMASIADOS_INTENTOS, LIMITES, claveLimite } from "@/lib/seguridad/limite-reglas";
import { avisarDosPasosActivada } from "@/lib/seguridad/avisos-seguridad";

// Acciones de la pantalla /dos-pasos (seguridad · 19 nov 2026): activar la verificación en dos pasos y escribir el código al entrar.
//
// No piden un módulo (`requireModulo*`) a propósito: quien llega aquí entró solo con su contraseña y, si le falta la verificación,
// `getUsuarioActual` no le da ninguno todavía. La guardia es la de solo sesión: `getUsuarioIdSesion` (la sesión que Supabase comprobó)
// más `getDosPasos`, que exige un perfil ACTIVO del equipo (una cuenta suspendida, una del portal del proveedor o sin perfil no pasa).
// Todo es sobre la cuenta de la sesión, nunca sobre un id que mande el navegador; el factor que llega se busca entre los de esa cuenta.
// Ninguna da datos ni permisos: lo único que hacen es subir la sesión a `aal2` si el código es correcto, y eso lo decide Supabase.

const SIN_SESION = "Tu sesión terminó. Vuelve a iniciar sesión.";
const CODIGO_MALO = "El código no es correcto o ya venció. Escribe el que muestra ahora la app (cambia cada 30 segundos) y revisa que la hora del celular esté bien.";

/** La persona de la sesión con su estado, o null. */
async function personaDeLaSesion(): Promise<DosPasosSesion | null> {
  const id = await getUsuarioIdSesion();
  if (!id) return null;
  const dos = await getDosPasos();
  return dos && dos.perfilId === id ? dos : null;
}

/** Anota en el historial algo de la verificación de la persona (no se usa `registrarAuditoria`: antes del código, `getUsuarioActual` es null). */
async function anotar(persona: DosPasosSesion, accion: string, detalle: string) {
  await createServiceClient()
    .from("historial_auditoria")
    .insert({ usuario_id: persona.perfilId, usuario_nombre: persona.nombre ?? persona.email, accion, entidad: "perfiles", entidad_id: persona.perfilId, detalle });
}

export interface Activacion {
  error?: string;
  factorId?: string;
  /** El código QR como `data:image/svg+xml;base64,…`, para un `<img>`. */
  qr?: string;
  /** La clave para escribir a mano en la app, si no se puede leer el QR. */
  clave?: string;
  /** `otpauth://…`: abre la app de códigos directo, si se está en el celular. */
  enlace?: string;
}

/**
 * Empieza a activar la verificación: borra lo que haya quedado a medio activar (factores sin confirmar de esta cuenta) y pide a Supabase
 * uno nuevo con su QR y su clave. No queda activa hasta `confirmarActivacion` con un código correcto.
 */
export async function empezarActivacion(): Promise<Activacion> {
  const persona = await personaDeLaSesion();
  if (!persona) return { error: SIN_SESION };
  if (factorVerificado(persona.factores)) return { error: "Ya tienes la verificación en dos pasos activa." };

  const admin = createServiceClient().auth.admin.mfa;
  const { data: lista, error: errorLista } = await admin.listFactors({ userId: persona.perfilId });
  if (errorLista) return { error: "No se pudo empezar. Intenta de nuevo." };
  for (const f of lista?.factors ?? []) {
    if (f.status === "verified") return { error: "Ya tienes la verificación en dos pasos activa." };
    const { error } = await admin.deleteFactor({ id: f.id, userId: persona.perfilId });
    if (error) return { error: "No se pudo empezar. Intenta de nuevo." };
  }

  const sesion = await createSessionClient();
  const { data, error } = await sesion.auth.mfa.enroll({ factorType: "totp", issuer: "Ecomfive", friendlyName: "App de códigos" });
  if (error || !data || data.type !== "totp") return { error: "No se pudo empezar. Intenta de nuevo." };
  const qr = qrComoImagen(data.totp.qr_code);
  const enlace = data.totp.uri?.startsWith("otpauth://totp/") ? data.totp.uri : undefined;
  if (!qr && !data.totp.secret) return { error: "No se pudo empezar. Intenta de nuevo." };
  return { factorId: data.id, qr: qr ?? undefined, clave: data.totp.secret, enlace };
}

/** Confirma la activación con el primer código de la app: si es correcto, la verificación queda activa y esta sesión pasa a `aal2`. */
export async function confirmarActivacion(factorId: string, codigo: string): Promise<{ error?: string }> {
  const persona = await personaDeLaSesion();
  if (!persona) return { error: SIN_SESION };
  const limpio = limpiarCodigo(codigo);
  if (!limpio) return { error: "Escribe los 6 números que muestra la app." };
  if (!esUuid(factorId)) return { error: "Vuelve a empezar la activación." };

  // El factor tiene que ser de esta cuenta y estar a medio activar (Supabase también lo exige: el token es de esta persona).
  const { data: lista } = await createServiceClient().auth.admin.mfa.listFactors({ userId: persona.perfilId });
  const factor = (lista?.factors ?? []).find((f) => f.id === factorId && f.factor_type === "totp");
  if (!factor) return { error: "Vuelve a empezar la activación." };

  // Tope de intentos del código (seguridad · 19 nov 2026).
  if (!(await limitar(claveLimite("dos-pasos", persona.perfilId), LIMITES.dosPasos))) return { error: DEMASIADOS_INTENTOS };
  const sesion = await createSessionClient();
  const { error } = await sesion.auth.mfa.challengeAndVerify({ factorId, code: limpio });
  if (error) return { error: CODIGO_MALO };
  await anotar(persona, "activar_dos_pasos", "Activó la verificación en dos pasos");
  await avisarDosPasosActivada(persona.perfilId);
  return {};
}

/** El código al entrar: con la verificación ya activa, sube esta sesión a `aal2` si el código es correcto. */
export async function verificarCodigo(codigo: string): Promise<{ error?: string }> {
  const persona = await personaDeLaSesion();
  if (!persona) return { error: SIN_SESION };
  if (persona.estado === "listo") return {};
  const limpio = limpiarCodigo(codigo);
  if (!limpio) return { error: "Escribe los 6 números que muestra la app." };
  const factor = factorVerificado(persona.factores);
  if (!factor) return { error: "No tienes la verificación en dos pasos activa." };

  // Tope de intentos del código (seguridad · 19 nov 2026).
  if (!(await limitar(claveLimite("dos-pasos", persona.perfilId), LIMITES.dosPasos))) return { error: DEMASIADOS_INTENTOS };
  const sesion = await createSessionClient();
  const { error } = await sesion.auth.mfa.challengeAndVerify({ factorId: factor.id, code: limpio });
  if (error) return { error: CODIGO_MALO };
  return {};
}
