"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { conversacionPermitida } from "../bandeja/datos-bandeja";

// Borrar un chat o un mensaje de WhatsApp (2 nov 2026, pedido de Jhokser): sin autorización, como en WhatsApp Business. Quien puede escribir en el chat lo borra y queda
// anotado quién. No se pierde nada (la migración 0171 impide cualquier DELETE): a quien tiene solo Atención se le quita, y Comercial, Dirección y los administradores lo
// siguen viendo con la etiqueta de que se borró. Se reutilizan las marcas de «borrado en WhatsApp» (`borrados-atencion.ts`). Un administrador lo puede restaurar.

const RUTA = "/crm-dropshippers/borrados";
const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const FALTA_MIGRACION = "Falta correr la migración 0219 (borrar sin autorización).";

/** Quien puede escribir en el CRM (Atención, Comercial o Dirección). */
async function usuarioQueEscribe(): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return null;
  const a = accesoCrm(u);
  return a.escribeAtencion || a.escribeComercial || a.escribeDireccion ? u : null;
}

const nombreDe = (u: UsuarioActual) => u.nombre || u.email;
const faltaColumna = (e: { code?: string; message?: string }) => e.code === "42703" || /eliminado_por|borrada_desde_sistema|borrada_en_app/.test(e.message ?? "");

function refrescar() {
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/bandeja");
  revalidatePath("/crm-dropshippers");
}

/** Borra un mensaje: queda marcado como eliminado y con quién lo borró. A Atención se le quita; a los demás les sale con la etiqueta. */
export async function borrarMensaje(conversacionId: string, mensajeId: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioQueEscribe();
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(conversacionId) || !ES_ID(mensajeId)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { data: m } = await supabase.from("whatsapp_mensajes").select("id, tipo, eliminado_en_whatsapp_en").eq("id", mensajeId).eq("conversacion_id", conversacionId).maybeSingle();
  if (!m) return { error: "Ese mensaje no está en esta conversación." };
  if (m.tipo === "reaccion") return { error: "Una reacción no se borra: se quita reaccionando de nuevo." };
  if (m.eliminado_en_whatsapp_en) return { error: "Ese mensaje ya está borrado." };
  const { data: hecho, error } = await supabase
    .from("whatsapp_mensajes")
    .update({ eliminado_en_whatsapp_en: new Date().toISOString(), eliminado_por: nombreDe(u) })
    .eq("id", mensajeId)
    .is("eliminado_en_whatsapp_en", null)
    .select("id");
  if (error) return { error: faltaColumna(error) ? FALTA_MIGRACION : "No se pudo borrar el mensaje." };
  if (!hecho?.length) return { error: "Ese mensaje ya está borrado." };
  await registrarAuditoria({ accion: "borrar_mensaje_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: "Mensaje borrado" });
  refrescar();
  return { ok: true };
}

/** Borra un chat entero: queda marcado como borrado, con quién y cuándo. Si el cliente vuelve a escribir, reaparece solo con lo nuevo (como en WhatsApp). */
export async function borrarChat(conversacionId: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioQueEscribe();
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(conversacionId)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const { data: hecho, error } = await supabase
    .from("whatsapp_conversaciones")
    .update({ borrada_en_app_en: new Date().toISOString(), borrada_en_app_por: nombreDe(u), borrada_desde_sistema: true })
    .eq("id", conversacionId)
    .is("borrada_en_app_en", null)
    .select("id");
  if (error) return { error: faltaColumna(error) ? FALTA_MIGRACION : "No se pudo borrar el chat." };
  if (!hecho?.length) return { error: "Ese chat ya está borrado." };
  await registrarAuditoria({ accion: "borrar_chat_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: "Chat borrado" });
  refrescar();
  return { ok: true };
}

/** Un administrador devuelve a la bandeja un chat o un mensaje que se borró desde el sistema (lo que se borró en la app de WhatsApp no se restaura aquí). */
export async function restaurarBorrado(tipo: string, id: string): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo un administrador puede restaurar lo borrado." };
  if ((tipo !== "chat" && tipo !== "mensaje") || !ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  const { data, error } =
    tipo === "chat"
      ? await supabase.from("whatsapp_conversaciones").update({ borrada_en_app_en: null, borrada_en_app_por: null, borrada_desde_sistema: false }).eq("id", id).eq("borrada_desde_sistema", true).select("id")
      : await supabase.from("whatsapp_mensajes").update({ eliminado_en_whatsapp_en: null, eliminado_por: null }).eq("id", id).not("eliminado_por", "is", null).select("id, conversacion_id");
  if (error || !data?.length) return { error: "No se pudo restaurar (puede que ya no esté borrado)." };
  const conversacionId = tipo === "chat" ? id : (data[0] as unknown as { conversacion_id: string }).conversacion_id;
  await registrarAuditoria({ accion: "restaurar_borrado_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: tipo === "chat" ? "Chat restaurado" : "Mensaje restaurado" });
  refrescar();
  return { ok: true };
}
