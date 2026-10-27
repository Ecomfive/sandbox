"use server";

import { redirect } from "next/navigation";
import { getUsuarioSesionBruta } from "@/lib/auth";
import { normalizarCodigo, segundoPasoActivo } from "@/lib/seguridad/segundo-paso";
import { factorTotp } from "@/lib/seguridad/segundo-paso-servidor";
import { createSessionClient } from "@/lib/supabase/server";

export interface VerificarEstado {
  error?: string;
}

/** Quien puso la contraseña y todavía no el código (con la verificación encendida); si no, vuelve a donde corresponde. */
async function personaEnVerificacion() {
  const usuario = await getUsuarioSesionBruta();
  if (!usuario) redirect("/login");
  if (!segundoPasoActivo()) redirect("/");
  return usuario;
}

/**
 * Comprueba el código de 6 dígitos de la app autenticadora: Supabase sube la sesión a `aal2` y la persona entra. Devuelve el error como
 * valor.
 */
export async function verificarSegundoPaso(_anterior: VerificarEstado, formData: FormData): Promise<VerificarEstado> {
  await personaEnVerificacion();
  const codigo = normalizarCodigo(formData.get("codigo"));
  if (!codigo) return { error: "El código tiene 6 dígitos." };
  const factor = await factorTotp();
  if (!factor) return { error: "No tienes una app autenticadora activada: recarga la página para activarla." };
  const { error } = await (await createSessionClient()).auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
  if (error) return { error: "Código incorrecto o vencido." };
  redirect("/");
}

/**
 * Quien todavía no tiene la app la activa en este mismo ingreso (es obligatoria): devuelve el código QR y la clave. No queda activa hasta
 * confirmar con un código de la app (`confirmarActivacionObligatoria`). Un intento anterior sin confirmar se descarta.
 */
export async function iniciarActivacionObligatoria(): Promise<{ factorId: string; qr: string; clave: string } | { error: string }> {
  await personaEnVerificacion();
  const supabase = await createSessionClient();
  const { data: lista } = await supabase.auth.mfa.listFactors();
  if ((lista?.totp ?? []).some((f) => f.status === "verified")) return { error: "Ya tienes una app autenticadora: recarga la página." };
  for (const f of (lista?.all ?? []).filter((x) => x.factor_type === "totp" && x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Ecomfive ${Date.now()}`, issuer: "Ecomfive" });
  if (error || !data?.totp) return { error: "No se pudo preparar la app autenticadora. Inténtalo de nuevo." };
  return { factorId: data.id, qr: data.totp.qr_code, clave: data.totp.secret };
}

/** Confirma la app recién activada con su primer código: la sesión sube a `aal2` y la persona entra. */
export async function confirmarActivacionObligatoria(factorId: string, codigo: string): Promise<VerificarEstado> {
  await personaEnVerificacion();
  const limpio = normalizarCodigo(codigo);
  if (!limpio) return { error: "El código tiene 6 dígitos." };
  if (!/^[0-9a-f-]{36}$/i.test(String(factorId))) return { error: "Vuelve a empezar la activación." };
  const { error } = await (await createSessionClient()).auth.mfa.challengeAndVerify({ factorId, code: limpio });
  if (error) return { error: "Código incorrecto. Revisa que la hora de tu celular sea la automática e inténtalo con el código nuevo." };
  redirect("/");
}
