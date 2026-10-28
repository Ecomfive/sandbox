import type { SupabaseClient } from "@supabase/supabase-js";
import { puedeCancelar, puedeResolver, vistaPreviaTexto, type EstadoSolicitud } from "@/lib/whatsapp/borrado";

/** Una petición de borrar un chat o un mensaje, con lo que hace falta para decidir. */
export interface SolicitudVista {
  id: string;
  tipo: "chat" | "mensaje";
  estado: EstadoSolicitud;
  motivo: string;
  /** Con quién es el chat (el nombre en el CRM, el de su perfil de WhatsApp o su teléfono). */
  chat: string;
  /** El mensaje que se quiere borrar, en una línea (solo si es un mensaje). */
  vista: string;
  solicitante: string;
  autorizan: string[];
  resueltaPor: string | null;
  resueltaEn: string | null;
  nota: string | null;
  creadoEn: string;
  /** La hizo la persona de la sesión. */
  esMia: boolean;
  /** La persona de la sesión puede autorizarla o rechazarla. */
  puedeResolver: boolean;
  puedeCancelar: boolean;
}

/** Un chat o un mensaje que ya se autorizó ocultar (solo lo ven los administradores, que lo pueden recuperar). */
export interface OcultoVista {
  tipo: "chat" | "mensaje";
  id: string;
  chat: string;
  vista: string;
  por: string | null;
  en: string;
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type FilaChat = { nombre_perfil: string | null; dropshippers: Uno<{ nombre: string }> };
const nombreDelChat = (c: Uno<FilaChat>): string => {
  const f = uno(c);
  return f ? (uno(f.dropshippers)?.nombre ?? f.nombre_perfil ?? "Chat sin nombre") : "Chat";
};

const CHAT = "whatsapp_conversaciones(nombre_perfil, dropshippers(nombre))";

/**
 * Las peticiones que le tocan a esta persona (las que debe resolver, las que hizo; un administrador las ve todas) y, para un administrador, lo que está
 * oculto. `null` si falta la migración 0172.
 */
export async function cargarBorrados(supabase: SupabaseClient, usuario: { id: string }, esAdmin: boolean): Promise<{ solicitudes: SolicitudVista[]; ocultos: OcultoVista[] } | null> {
  const { data, error } = await supabase
    .from("whatsapp_solicitudes_borrado")
    .select(`id, tipo, estado, motivo, solicitante_id, solicitante_nombre, autoriza_a, resuelta_por_nombre, resuelta_en, nota_resolucion, creado_en, ${CHAT}, whatsapp_mensajes(texto, tipo)`)
    .order("creado_en", { ascending: false })
    .limit(300);
  if (error) return null;
  const filas = (data ?? []).filter((s) => esAdmin || s.solicitante_id === usuario.id || ((s.autoriza_a as string[]) ?? []).includes(usuario.id));
  const ids = [...new Set(filas.flatMap((s) => (s.autoriza_a as string[]) ?? []))];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre, email").in("id", ids) : { data: [] };
  const nombres = new Map((perfiles ?? []).map((p) => [p.id as string, (p.nombre as string | null) || (p.email as string)]));
  const solicitudes: SolicitudVista[] = filas.map((s) => {
    const m = uno(s.whatsapp_mensajes as Uno<{ texto: string | null; tipo: string }>);
    const autoriza = (s.autoriza_a as string[]) ?? [];
    const solicitanteId = (s.solicitante_id as string | null) ?? null;
    const pendiente = s.estado === "pendiente";
    return {
      id: s.id as string,
      tipo: s.tipo as "chat" | "mensaje",
      estado: s.estado as EstadoSolicitud,
      motivo: s.motivo as string,
      chat: nombreDelChat(s.whatsapp_conversaciones as Uno<FilaChat>),
      vista: s.tipo === "mensaje" ? vistaPreviaTexto(m?.texto) || `(${m?.tipo ?? "mensaje"})` : "",
      solicitante: s.solicitante_nombre as string,
      autorizan: autoriza.map((id) => nombres.get(id) ?? "Alguien"),
      resueltaPor: (s.resuelta_por_nombre as string | null) ?? null,
      resueltaEn: (s.resuelta_en as string | null) ?? null,
      nota: (s.nota_resolucion as string | null) ?? null,
      creadoEn: s.creado_en as string,
      esMia: solicitanteId === usuario.id,
      puedeResolver: pendiente && puedeResolver(usuario.id, autoriza, solicitanteId),
      puedeCancelar: pendiente && puedeCancelar(usuario.id, solicitanteId, esAdmin),
    };
  });

  const ocultos: OcultoVista[] = [];
  if (esAdmin) {
    const [chats, mensajes] = await Promise.all([
      supabase.from("whatsapp_conversaciones").select("id, nombre_perfil, oculta_en, oculta_por, dropshippers(nombre)").not("oculta_en", "is", null).order("oculta_en", { ascending: false }).limit(100),
      supabase.from("whatsapp_mensajes").select(`id, texto, tipo, oculto_en, oculto_por, ${CHAT}`).not("oculto_en", "is", null).order("oculto_en", { ascending: false }).limit(100),
    ]);
    for (const c of chats.data ?? []) ocultos.push({ tipo: "chat", id: c.id as string, chat: nombreDelChat(c as unknown as FilaChat), vista: "", por: (c.oculta_por as string | null) ?? null, en: c.oculta_en as string });
    for (const m of mensajes.data ?? [])
      ocultos.push({ tipo: "mensaje", id: m.id as string, chat: nombreDelChat(m.whatsapp_conversaciones as Uno<FilaChat>), vista: vistaPreviaTexto(m.texto as string | null) || `(${m.tipo as string})`, por: (m.oculto_por as string | null) ?? null, en: m.oculto_en as string });
    ocultos.sort((a, b) => b.en.localeCompare(a.en));
  }
  return { solicitudes, ocultos };
}
