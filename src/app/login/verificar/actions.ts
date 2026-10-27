"use server";

import { redirect } from "next/navigation";
import { getUsuarioSesionBruta } from "@/lib/auth";
import { normalizarCodigo, segundoPasoActivo } from "@/lib/seguridad/segundo-paso";
import { enviarCodigoCorreo, factorTotp, marcarSegundoPasoCumplido, verificarCodigoCorreo } from "@/lib/seguridad/segundo-paso-servidor";
import { createSessionClient } from "@/lib/supabase/server";

export interface VerificarEstado {
  error?: string;
  aviso?: string;
  /** Con qué método se pide el código ahora (cambia al pedir el del correo). */
  modo?: "totp" | "correo";
}

/**
 * Comprueba el segundo paso del ingreso: el código de la app autenticadora (Supabase sube la sesión a `aal2`) o el que llegó por correo
 * (queda una marca firmada atada a esta sesión). Con uno u otro, la persona entra. Devuelve el error como valor.
 */
export async function verificarSegundoPaso(_anterior: VerificarEstado, formData: FormData): Promise<VerificarEstado> {
  const usuario = await getUsuarioSesionBruta();
  if (!usuario) redirect("/login");
  if (!segundoPasoActivo()) redirect("/");
  const modo = formData.get("modo") === "totp" ? "totp" : "correo";
  if (modo === "totp") {
    const codigo = normalizarCodigo(formData.get("codigo"));
    if (!codigo) return { modo, error: "El código tiene 6 dígitos." };
    const factor = await factorTotp();
    if (!factor) return { modo: "correo", error: "No tienes una app autenticadora activada: usa el código por correo." };
    const { error } = await (await createSessionClient()).auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
    if (error) return { modo, error: "Código incorrecto o vencido." };
    redirect("/");
  }
  const r = await verificarCodigoCorreo(usuario.id, formData.get("codigo"));
  if ("error" in r) return { modo, error: r.error };
  if (!(await marcarSegundoPasoCumplido(usuario.id))) return { modo, error: "No se pudo completar el ingreso. Cierra la sesión y entra de nuevo." };
  redirect("/");
}

/** Pide (o vuelve a pedir) el código por correo: para quien no tiene app autenticadora o no la tiene a la mano. */
export async function pedirCodigoPorCorreo(): Promise<VerificarEstado> {
  const usuario = await getUsuarioSesionBruta();
  if (!usuario?.email) redirect("/login");
  if (!segundoPasoActivo()) redirect("/");
  const r = await enviarCodigoCorreo(usuario.id, usuario.email);
  if ("error" in r) return { modo: "correo", error: r.error };
  return { modo: "correo", aviso: "Te mandamos un código nuevo. Puede tardar un minuto en llegar; revisa también el correo no deseado." };
}
