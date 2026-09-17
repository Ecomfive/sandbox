"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";

export interface ActualizarClaveState {
  error?: string;
}

/**
 * El link de invitación de Supabase llega con el access/refresh token como
 * fragmento de la URL (nunca llega al servidor), así que el cliente los lee
 * del hash y los manda aquí para dejar la sesión en una cookie httpOnly.
 */
export async function establecerSesionDesdeHash(accessToken: string, refreshToken: string) {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new Error(error.message);
}

/**
 * Variante del link de invitación en la que Supabase manda `token_hash` y
 * `type` como parámetros normales de URL en vez del fragmento con tokens.
 */
export async function verificarInvitacion(tokenHash: string, type: EmailOtpType) {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) throw new Error(error.message);
}

export async function actualizarClave(
  _prevState: ActualizarClaveState,
  formData: FormData
): Promise<ActualizarClaveState> {
  const password = formData.get("password") as string;
  const confirmacion = formData.get("confirmacion") as string;

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmacion) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "El link de invitación ya venció. Pide que te reenvíen la invitación." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/");
}
