// La sesión de proveedor de Dropi que el sistema usa para cambiar productos (migración 0137, «Conectar Dropi»). Se guarda cifrada con
// AES-256-GCM y una clave que solo tiene el servidor (`DROPI_SESION_CLAVE` o, si no está, una derivada de la clave de servicio de
// Supabase): la fila sola no sirve. Dura lo que dura la sesión en Dropi (12 horas); vencida, es como no tener ninguna. El token no se
// devuelve nunca al navegador ni se escribe en la actividad.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Margen antes del vencimiento: con menos de esto ya no se usa (un cambio a medias es peor que uno pendiente). */
const MARGEN_MS = 5 * 60_000;

function clave(): Buffer {
  const base = process.env.DROPI_SESION_CLAVE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta la clave del servidor para guardar la sesión de Dropi.");
  return createHash("sha256").update(`dropi-sesion:${base}`).digest();
}

export function cifrarToken(token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64url")).join(".");
}

export function descifrarToken(cifrado: string): string | null {
  try {
    const [iv, tag, datos] = cifrado.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", clave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export interface ConexionDropi {
  conectada: boolean;
  venceEn: string | null;
  conectadoPor: string | null;
  conectadoEn: string | null;
  dropiUsuario: string | null;
}

/** Cómo está la conexión con Dropi de un país, para mostrarla (sin el token). Sin la migración 0137, desconectada. */
export async function estadoConexionDropi(supabase: SupabaseClient, paisId: string): Promise<ConexionDropi> {
  const { data } = await supabase.from("dropi_conexiones").select("vence_en, conectado_por_nombre, conectado_en, dropi_usuario").eq("pais_id", paisId).maybeSingle();
  if (!data) return { conectada: false, venceEn: null, conectadoPor: null, conectadoEn: null, dropiUsuario: null };
  return {
    conectada: Date.parse(data.vence_en as string) - MARGEN_MS > Date.now(),
    venceEn: data.vence_en as string,
    conectadoPor: (data.conectado_por_nombre as string | null) ?? null,
    conectadoEn: (data.conectado_en as string | null) ?? null,
    dropiUsuario: (data.dropi_usuario as string | null) ?? null,
  };
}

/** La sesión vigente de un país (token y usuario de Dropi), o null si no hay, venció o no se puede descifrar. Solo en el servidor. */
export async function sesionVigenteDropi(supabase: SupabaseClient, paisId: string): Promise<{ token: string; usuarioId: number } | null> {
  const { data } = await supabase.from("dropi_conexiones").select("token_cifrado, dropi_usuario_id, vence_en").eq("pais_id", paisId).maybeSingle();
  if (!data || Date.parse(data.vence_en as string) - MARGEN_MS <= Date.now()) return null;
  const token = descifrarToken(data.token_cifrado as string);
  return token ? { token, usuarioId: Number(data.dropi_usuario_id) } : null;
}

export async function guardarSesionDropi(
  supabase: SupabaseClient,
  s: { paisId: string; token: string; usuarioId: number; usuario: string | null; venceEn: Date; por: { id: string; nombre: string } },
): Promise<string | null> {
  const { error } = await supabase.from("dropi_conexiones").upsert({
    pais_id: s.paisId,
    token_cifrado: cifrarToken(s.token),
    dropi_usuario_id: s.usuarioId,
    dropi_usuario: s.usuario,
    vence_en: s.venceEn.toISOString(),
    conectado_por: s.por.id,
    conectado_por_nombre: s.por.nombre,
    conectado_en: new Date().toISOString(),
  });
  return error ? error.message : null;
}

export async function borrarSesionDropi(supabase: SupabaseClient, paisId: string) {
  await supabase.from("dropi_conexiones").delete().eq("pais_id", paisId);
}
