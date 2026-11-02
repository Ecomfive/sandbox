import type { SupabaseClient } from "@supabase/supabase-js";
import { vistaPreviaTexto } from "@/lib/whatsapp/borrado";

/** Un chat o un mensaje que se borró desde el sistema. */
export interface BorradoVista {
  tipo: "chat" | "mensaje";
  id: string;
  /** Con quién es el chat (el nombre en el CRM, el de su perfil de WhatsApp o «Chat»). */
  chat: string;
  /** El mensaje borrado, en una línea (solo si es un mensaje). */
  vista: string;
  por: string | null;
  en: string;
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type FilaChat = { nombre_perfil: string | null; nombre_personalizado?: string | null; dropshippers: Uno<{ nombre: string }> };
const nombreDelChat = (c: Uno<FilaChat>): string => {
  const f = uno(c);
  return f ? (f.nombre_personalizado ?? uno(f.dropshippers)?.nombre ?? f.nombre_perfil ?? "Chat sin nombre") : "Chat";
};

const CHAT = "whatsapp_conversaciones(nombre_perfil, dropshippers(nombre))";

/**
 * Lo que se borró desde el sistema (los más recientes primero). `null` si falta la migración 0219. El borrado en WhatsApp Business no está aquí: eso lo avisa
 * Meta o lo marca una persona, y no se restaura desde el sistema.
 */
export async function cargarBorrados(supabase: SupabaseClient): Promise<BorradoVista[] | null> {
  const [chats, mensajes] = await Promise.all([
    supabase.from("whatsapp_conversaciones").select("id, nombre_perfil, borrada_en_app_en, borrada_en_app_por, dropshippers(nombre)").eq("borrada_desde_sistema", true).order("borrada_en_app_en", { ascending: false }).limit(100),
    supabase.from("whatsapp_mensajes").select(`id, texto, tipo, eliminado_en_whatsapp_en, eliminado_por, ${CHAT}`).not("eliminado_por", "is", null).order("eliminado_en_whatsapp_en", { ascending: false }).limit(100),
  ]);
  if (chats.error || mensajes.error) return null;
  const lista: BorradoVista[] = [];
  for (const c of chats.data ?? []) lista.push({ tipo: "chat", id: c.id as string, chat: nombreDelChat(c as unknown as FilaChat), vista: "", por: (c.borrada_en_app_por as string | null) ?? null, en: c.borrada_en_app_en as string });
  for (const m of mensajes.data ?? [])
    lista.push({ tipo: "mensaje", id: m.id as string, chat: nombreDelChat(m.whatsapp_conversaciones as Uno<FilaChat>), vista: vistaPreviaTexto(m.texto as string | null) || `(${m.tipo as string})`, por: (m.eliminado_por as string | null) ?? null, en: m.eliminado_en_whatsapp_en as string });
  return lista.sort((a, b) => b.en.localeCompare(a.en));
}
