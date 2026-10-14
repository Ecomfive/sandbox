"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { BUCKET_INSTAGRAM } from "@/lib/instagram/guardar";
import { createServiceClient } from "@/lib/supabase/server";
import { ESTADOS_INSTAGRAM, etiquetaEstadoInstagram } from "./def-instagram";

const MODULO = "instagram";
const ENTIDAD = "instagram_capturas";
const RUTA = "/instagram";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS: Set<string> = new Set(ESTADOS_INSTAGRAM.map((e) => e.valor));

/** Un enlace: solo http(s), para que un `javascript:` no termine en un `href`. */
function enlace(formData: FormData, campo: string, nombre: string): string | null | { error: string } {
  const t = String(formData.get(campo) ?? "").trim().slice(0, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    return { error: `${nombre}: pega un enlace completo (https://…).` };
  }
}

/**
 * Guarda lo que se completa a mano en una captura: su estado, la página de destino y las notas. Lo demás (quién lo envió, el
 * enlace, el copy, el video) lo pone el webhook y no se edita. Devuelve el error como valor: en producción Next.js oculta el
 * mensaje de una excepción.
 */
export async function actualizarCaptura(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Captura no válida." };
  const estado = String(formData.get("estado") ?? "");
  if (!ESTADOS.has(estado)) return { error: "Estado no válido." };
  const pagina = enlace(formData, "pagina_destino", "Página de destino");
  if (pagina !== null && typeof pagina === "object") return pagina;
  const notas = String(formData.get("notas") ?? "").trim().slice(0, 4000) || null;

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from(ENTIDAD).select("estado, pagina_destino, notas").eq("id", id).maybeSingle();
  if (!antes) return { error: "La captura ya no existe." };
  const { error } = await supabase.from(ENTIDAD).update({ estado, pagina_destino: pagina, notas, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  const cambio: { antes: Record<string, string>; despues: Record<string, string> } = { antes: {}, despues: {} };
  if (antes.estado !== estado) {
    cambio.antes.Estado = etiquetaEstadoInstagram(antes.estado);
    cambio.despues.Estado = etiquetaEstadoInstagram(estado);
  }
  if ((antes.pagina_destino ?? null) !== pagina) {
    cambio.antes["Página de destino"] = antes.pagina_destino ?? "—";
    cambio.despues["Página de destino"] = pagina ?? "—";
  }
  if ((antes.notas ?? null) !== notas) {
    cambio.antes.Notas = antes.notas ? "(texto)" : "—";
    cambio.despues.Notas = notas ? "(texto)" : "—";
  }
  if (Object.keys(cambio.despues).length > 0) await registrarAuditoria({ accion: "actualizar_captura_instagram", entidad: ENTIDAD, entidadId: id, ...cambio });
  revalidatePath(RUTA);
  return {};
}

/** El enlace firmado (una hora) del video de una captura, para verlo en su ficha. El bucket es privado. */
export async function urlVideoCaptura(id: string): Promise<{ url: string } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from(ENTIDAD).select("video_ruta").eq("id", id).maybeSingle();
  if (!data?.video_ruta) return { error: "Esta captura no tiene video." };
  const firmado = await supabase.storage.from(BUCKET_INSTAGRAM).createSignedUrl(data.video_ruta, 3600);
  if (firmado.error || !firmado.data) return { error: "No se pudo abrir el video." };
  return { url: firmado.data.signedUrl };
}

/** La actividad de una captura (de la auditoría), de la más nueva a la más vieja. Basta poder abrir el módulo. */
export async function obtenerHistorialCaptura(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", ENTIDAD)
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
