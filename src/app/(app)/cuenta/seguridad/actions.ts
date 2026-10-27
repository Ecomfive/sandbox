"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarCodigo } from "@/lib/seguridad/segundo-paso";
import { createSessionClient } from "@/lib/supabase/server";

/** Quién es la persona (con el segundo paso ya cumplido, si está encendido): todo lo de esta pantalla es de su propia cuenta. */
async function persona() {
  return getUsuarioActual();
}

/**
 * Empieza a activar la app autenticadora (TOTP, el MFA nativo de Supabase): devuelve el código QR y la clave para escribirla a mano. Si había
 * un intento sin confirmar, se descarta. No queda activa hasta confirmar con un código de la app (`confirmarActivacionTotp`).
 */
export async function iniciarActivacionTotp(): Promise<{ factorId: string; qr: string; clave: string } | { error: string }> {
  if (!(await persona())) return { error: "Inicia sesión de nuevo." };
  const supabase = await createSessionClient();
  const { data: lista } = await supabase.auth.mfa.listFactors();
  if ((lista?.totp ?? []).some((f) => f.status === "verified")) return { error: "Ya tienes una app autenticadora activada." };
  // Un intento anterior sin confirmar estorba (el nombre debe ser único): se quita.
  for (const f of (lista?.all ?? []).filter((x) => x.factor_type === "totp" && x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Ecomfive ${Date.now()}`, issuer: "Ecomfive" });
  if (error || !data?.totp) return { error: "No se pudo preparar la app autenticadora. Inténtalo de nuevo." };
  return { factorId: data.id, qr: data.totp.qr_code, clave: data.totp.secret };
}

/** Confirma la app autenticadora con el primer código que muestra: desde ese momento se pide al ingresar. */
export async function confirmarActivacionTotp(factorId: string, codigo: string): Promise<{ ok: true } | { error: string }> {
  const usuario = await persona();
  if (!usuario) return { error: "Inicia sesión de nuevo." };
  const limpio = normalizarCodigo(codigo);
  if (!limpio) return { error: "El código tiene 6 dígitos." };
  if (!/^[0-9a-f-]{36}$/i.test(String(factorId))) return { error: "Vuelve a empezar la activación." };
  const { error } = await (await createSessionClient()).auth.mfa.challengeAndVerify({ factorId, code: limpio });
  if (error) return { error: "Código incorrecto. Revisa que la hora de tu celular sea la automática e inténtalo con el código nuevo." };
  await registrarAuditoria({ accion: "activar_segundo_paso_totp", entidad: "perfiles", entidadId: usuario.id, detalle: "Activó la app autenticadora" });
  revalidatePath("/cuenta/seguridad");
  return { ok: true };
}

/** Quita la app autenticadora. Pide un código vigente de la propia app: no basta con tener la sesión abierta. */
export async function desactivarTotp(codigo: string): Promise<{ ok: true } | { error: string }> {
  const usuario = await persona();
  if (!usuario) return { error: "Inicia sesión de nuevo." };
  const limpio = normalizarCodigo(codigo);
  if (!limpio) return { error: "Escribe el código de 6 dígitos de tu app para quitarla." };
  const supabase = await createSessionClient();
  const { data: lista } = await supabase.auth.mfa.listFactors();
  const factor = (lista?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return { error: "No tienes una app autenticadora activada." };
  const { error: errorCodigo } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: limpio });
  if (errorCodigo) return { error: "Código incorrecto." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { error: "No se pudo quitar la app autenticadora. Inténtalo de nuevo." };
  await registrarAuditoria({ accion: "desactivar_segundo_paso_totp", entidad: "perfiles", entidadId: usuario.id, detalle: "Quitó la app autenticadora" });
  revalidatePath("/cuenta/seguridad");
  return { ok: true };
}
