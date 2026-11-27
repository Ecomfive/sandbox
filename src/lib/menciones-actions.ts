"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { esSeccionUrgente, HREFS_DE_PEDIDOS, type SeccionUrgente } from "@/lib/avisos-urgentes";

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

/**
 * Al entrar a la pantalla donde se atienden, marca como leídos los avisos propios de esa sección (pedidos o mercancía en puerto): así el menú deja de estar en rojo. Devuelve cuántos marcó.
 * En «Ver así» no marca nada.
 */
export async function marcarAvisosVistos(seccion: SeccionUrgente): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || usuario.vistaPrevia || !esSeccionUrgente(seccion)) return 0;
  const sinLeer = createServiceClient().from("notificaciones_usuario").update({ leida_en: new Date().toISOString() }).eq("usuario_id", usuario.id).is("leida_en", null);
  const { data } = await (seccion === "llegadas" ? sinLeer.like("titulo", "Llega a puerto%") : sinLeer.in("href", [...HREFS_DE_PEDIDOS[seccion]])).select("id");
  if (data?.length) revalidatePath("/notificaciones");
  return data?.length ?? 0;
}

/** Marca como leídos todos los avisos propios. */
export async function marcarTodosLeidos(): Promise<void> {
  const usuario = await getUsuarioActual();
  if (!usuario) return;
  await createServiceClient().from("notificaciones_usuario").update({ leida_en: new Date().toISOString() }).eq("usuario_id", usuario.id).is("leida_en", null);
  revalidatePath("/notificaciones");
}
