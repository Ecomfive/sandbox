"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { claveNovedad } from "./actualizaciones";
import { NOVEDADES } from "./contenido";

const CLAVES = new Set(NOVEDADES.map(claveNovedad));
const FALTA = "Falta correr en Supabase la migración 0218 (actualizaciones vistas).";

/**
 * Marca una o varias actualizaciones del sistema como vistas (o, con `vista = false`, otra vez por leer) para la persona con sesión. Solo
 * claves que existen; devuelve el error como valor.
 */
export async function marcarNovedades(claves: string[], vista = true): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Tu sesión terminó." };
  const validas = [...new Set((Array.isArray(claves) ? claves : []).map(String))].filter((c) => CLAVES.has(c)).slice(0, 1000);
  if (!validas.length) return {};
  const supabase = createServiceClient();
  const { error } = vista
    ? await supabase.from("novedades_vistas").upsert(validas.map((clave) => ({ usuario_id: usuario.id, clave })), { onConflict: "usuario_id,clave", ignoreDuplicates: true })
    : await supabase.from("novedades_vistas").delete().eq("usuario_id", usuario.id).in("clave", validas);
  if (error) return { error: /novedades_vistas|relation/i.test(error.message) ? FALTA : "No se pudo guardar." };
  revalidatePath("/notificaciones");
  revalidatePath("/actualizaciones");
  return {};
}
