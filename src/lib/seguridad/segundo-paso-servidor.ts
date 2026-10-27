// Verificación en dos pasos (27 oct 2026), la parte que toca la base, las cookies y el correo. La lógica pura está en segundo-paso.ts.
// El gate vive en `getUsuarioSesion` (src/lib/auth.ts): mientras el segundo paso no se cumpla, la persona no tiene sesión para el sistema
// (páginas, acciones y rutas de API), aunque la contraseña ya esté puesta. Las cuentas del portal del proveedor no pasan por aquí.

import { cookies } from "next/headers";
import { enviarCorreo } from "@/lib/notificaciones/correo";
import { cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { OPCIONES_COOKIE_SESION } from "@/lib/supabase/cookies";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import {
  CODIGO_VIDA_MIN,
  codigoCoincide,
  correoDelCodigo,
  firmarMarca,
  generarCodigo,
  huellaCodigo,
  marcaValida,
  MAX_ENVIOS_HORA,
  MAX_INTENTOS,
  normalizarCodigo,
  segundoPasoActivo,
  segundosParaReenviar,
  sesionDeToken,
  VIDA_MARCA_DIAS,
} from "./segundo-paso";

/** La cookie con la marca de «segundo paso cumplido» (httpOnly, firmada, atada a la sesión de Supabase). */
export const COOKIE_MARCA = "ecom_2fa";

const secreto = () => process.env.SEGUNDO_PASO_SECRETO ?? "";

/** El token de acceso de la sesión (solo para leer su sesión y su nivel; quién es la persona ya lo validó `getUser`). */
async function tokenDeAcceso(): Promise<string | null> {
  const { data } = await (await createSessionClient()).auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * ¿La sesión cumplió el segundo paso? Sí si la verificación está apagada, si la sesión ya subió a `aal2` (código de la app autenticadora),
 * si trae la marca firmada del código por correo para esta sesión, o si es una cuenta del portal del proveedor.
 */
export async function segundoPasoCumplido(usuarioId: string): Promise<boolean> {
  if (!segundoPasoActivo()) return true;
  const { sesionId, aal } = sesionDeToken(await tokenDeAcceso());
  if (aal === "aal2") return true;
  const marca = (await cookies()).get(COOKIE_MARCA)?.value;
  if (marcaValida(marca, usuarioId, sesionId, Date.now(), secreto())) return true;
  return (await cuentaDeProveedor(usuarioId)) !== null;
}

/** Deja la marca de segundo paso cumplido para esta sesión (solo desde una acción o ruta, que pueden escribir cookies). */
export async function marcarSegundoPasoCumplido(usuarioId: string): Promise<boolean> {
  const { sesionId } = sesionDeToken(await tokenDeAcceso());
  if (!sesionId) return false;
  const vence = Date.now() + VIDA_MARCA_DIAS * 86_400_000;
  (await cookies()).set(COOKIE_MARCA, firmarMarca(usuarioId, sesionId, vence, secreto()), { ...OPCIONES_COOKIE_SESION, maxAge: VIDA_MARCA_DIAS * 86_400 });
  return true;
}

export async function borrarMarcaSegundoPaso(): Promise<void> {
  (await cookies()).delete(COOKIE_MARCA);
}

/** La app autenticadora (TOTP) ya activada y confirmada de la persona con sesión, o null. */
export async function factorTotp(): Promise<{ id: string } | null> {
  const { data } = await (await createSessionClient()).auth.mfa.listFactors();
  const f = (data?.totp ?? []).find((x) => x.status === "verified");
  return f ? { id: f.id } : null;
}

/**
 * Manda un código de 6 dígitos al correo de la persona. Solo guarda su huella; los anteriores quedan sin efecto; tope de uno por minuto y
 * cinco por hora. Si el correo no sale, el código se borra y se dice (no se deja a nadie esperando algo que no va a llegar).
 */
export async function enviarCodigoCorreo(usuarioId: string, correo: string): Promise<{ ok: true } | { error: string; limite?: true }> {
  const supabase = createServiceClient();
  const { data: recientes, error } = await supabase
    .from("segundo_paso_codigos")
    .select("creado_en")
    .eq("usuario_id", usuarioId)
    .gte("creado_en", new Date(Date.now() - 3_600_000).toISOString())
    .order("creado_en", { ascending: false });
  if (error) return { error: "Falta correr en Supabase la migración 0166 (verificación en dos pasos)." };
  if ((recientes ?? []).length >= MAX_ENVIOS_HORA) return { error: "Ya se mandaron varios códigos: espera un rato antes de pedir otro.", limite: true };
  const espera = segundosParaReenviar((recientes?.[0]?.creado_en as string | undefined) ?? null, Date.now());
  if (espera > 0) return { error: `Espera ${espera} s para pedir otro código.`, limite: true };

  const codigo = generarCodigo();
  await supabase.from("segundo_paso_codigos").update({ usado_en: new Date().toISOString() }).eq("usuario_id", usuarioId).is("usado_en", null);
  const { data: fila, error: errorGuardar } = await supabase
    .from("segundo_paso_codigos")
    .insert({ usuario_id: usuarioId, codigo_hash: huellaCodigo(usuarioId, codigo, secreto()), vence_en: new Date(Date.now() + CODIGO_VIDA_MIN * 60_000).toISOString() })
    .select("id")
    .single();
  if (errorGuardar || !fila) return { error: "No se pudo preparar el código. Inténtalo de nuevo." };

  const { asunto, html } = correoDelCodigo(codigo);
  let enviado = false;
  try {
    enviado = (await enviarCorreo({ destinatarios: [correo], asunto, html })).enviado;
  } catch {
    enviado = false;
  }
  if (!enviado) {
    await supabase.from("segundo_paso_codigos").delete().eq("id", fila.id);
    return { error: "No se pudo mandar el código por correo. Avisa a quien administra el sistema." };
  }
  return { ok: true };
}

/**
 * Comprueba el código por correo. Cada intento se cuenta antes de comparar y de forma atómica (`segundo_paso_sumar_intento`), así que probar
 * muchos códigos en paralelo no da más de cinco oportunidades por código; el bueno solo sirve una vez y antes de vencer.
 */
export async function verificarCodigoCorreo(usuarioId: string, texto: unknown): Promise<{ ok: true } | { error: string }> {
  const codigo = normalizarCodigo(texto);
  if (!codigo) return { error: "El código tiene 6 dígitos." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase
    .from("segundo_paso_codigos")
    .select("id, codigo_hash, vence_en")
    .eq("usuario_id", usuarioId)
    .is("usado_en", null)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fila || Date.parse(fila.vence_en as string) <= Date.now()) return { error: "El código venció o no existe: pide otro." };
  const { data: intentos } = await supabase.rpc("segundo_paso_sumar_intento", { p_id: fila.id });
  if (typeof intentos !== "number" || intentos > MAX_INTENTOS) return { error: "Demasiados intentos con ese código: pide otro." };
  if (!codigoCoincide(fila.codigo_hash as string, usuarioId, codigo, secreto())) return { error: "Código incorrecto." };
  const { data: usado } = await supabase.from("segundo_paso_codigos").update({ usado_en: new Date().toISOString() }).eq("id", fila.id).is("usado_en", null).select("id");
  if (!usado?.length) return { error: "Ese código ya se usó: pide otro." };
  return { ok: true };
}
