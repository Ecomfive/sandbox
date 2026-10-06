"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** Una persona que se puede etiquetar con «@». */
export interface UsuarioMencionable {
  id: string;
  nombre: string;
}

/** Las personas activas del sistema, para la lista que aparece al escribir «@». Basta haber iniciado sesión. */
export async function usuariosMencionables(): Promise<UsuarioMencionable[]> {
  const usuario = await getUsuarioActual();
  if (!usuario) return [];
  const { data } = await createServiceClient().from("perfiles").select("id, nombre, email").eq("activo", true);
  return (data ?? [])
    .map((p) => ({ id: p.id as string, nombre: ((p.nombre as string | null) || (p.email as string)).trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Marca como leído un aviso propio (al abrirlo). */
export async function marcarAvisoLeido(id: string): Promise<void> {
  const usuario = await getUsuarioActual();
  if (!usuario || !ES_ID(id)) return;
  await createServiceClient()
    .from("notificaciones_usuario")
    .update({ leida_en: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuario.id)
    .is("leida_en", null);
  revalidatePath("/notificaciones");
}

/** Marca como leídos todos los avisos propios. */
export async function marcarTodosLeidos(): Promise<void> {
  const usuario = await getUsuarioActual();
  if (!usuario) return;
  await createServiceClient().from("notificaciones_usuario").update({ leida_en: new Date().toISOString() }).eq("usuario_id", usuario.id).is("leida_en", null);
  revalidatePath("/notificaciones");
}
