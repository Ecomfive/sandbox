import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { llegoLoEsperado, textoAvisoTarea } from "./tareas";

// Lo que hacen las tareas del CRM por su cuenta (29 oct 2026): activar las que esperaban un producto cuando llega de verdad y avisar en la
// campana a su responsable. Se llama al guardar una compra, al abrir el panel de tareas y en el aviso diario (cron). Nunca lanza: si algo
// falla, se intenta la próxima vez.

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Adónde lleva el aviso: al chat (se abre en su ventana) o, sin chat, al panel de tareas. */
export const enlaceTarea = (conversacionId: string | null) => (conversacionId ? `/crm-dropshippers/bandeja?abrir=${conversacionId}` : "/crm-dropshippers/tareas");

/** El nombre con que se reconoce al cliente en un aviso: el del CRM o, si no está, el que se le puso al chat o el de su WhatsApp. */
function nombreCliente(fila: { dropshippers?: Uno<{ nombre: string | null }>; whatsapp_conversaciones?: Uno<{ nombre_personalizado: string | null; nombre_perfil: string | null }> }) {
  const c = uno(fila.whatsapp_conversaciones ?? null);
  return uno(fila.dropshippers ?? null)?.nombre ?? c?.nombre_personalizado ?? c?.nombre_perfil ?? null;
}

/** Un aviso en la campana de una persona. */
export async function avisarTarea(
  supabase: SupabaseClient,
  aviso: { usuarioId: string | null; titulo: string; cliente: string | null; conversacionId: string | null; motivo: "llego" | "hoy" | "asignada"; autor?: { id: string; nombre: string | null } },
): Promise<void> {
  if (!aviso.usuarioId) return;
  const { titulo, texto } = textoAvisoTarea({ titulo: aviso.titulo, cliente: aviso.cliente }, aviso.motivo);
  await supabase.from("notificaciones_usuario").insert({
    usuario_id: aviso.usuarioId,
    tipo: "tarea",
    titulo,
    texto: texto.slice(0, 500),
    href: enlaceTarea(aviso.conversacionId),
    autor_id: aviso.autor?.id ?? null,
    autor_nombre: aviso.autor?.nombre ?? null,
  });
}

const CAMPOS = "id, titulo, conversacion_id, responsable_id, compras_esperadas, dropshippers(nombre), whatsapp_conversaciones(nombre_personalizado, nombre_perfil, asignada_a)";
type FilaTarea = {
  id: string;
  titulo: string;
  conversacion_id: string | null;
  responsable_id: string | null;
  compras_esperadas: string[] | null;
  dropshippers: Uno<{ nombre: string | null }>;
  whatsapp_conversaciones: Uno<{ nombre_personalizado: string | null; nombre_perfil: string | null; asignada_a: string | null }>;
};

/**
 * Activa las tareas que esperaban un producto y ya llegó: pasan a «pendiente» con fecha de hoy y quedan a cargo de quien lleva el chat
 * en ese momento (o de quien la tenía). A esa persona le llega el aviso. Devuelve cuántas se activaron.
 */
export async function activarTareasDeLlegada(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase.from("tareas_dropshipper").select(CAMPOS).eq("estado", "esperando").limit(500);
    if (error || !data?.length) return 0;
    const tareas = data as unknown as FilaTarea[];
    const ids = [...new Set(tareas.flatMap((t) => t.compras_esperadas ?? []))];
    if (!ids.length) return 0;
    const { data: compras } = await supabase.from("wms_compras").select("id, fecha_llegada, etapa").in("id", ids);
    const lista = (compras ?? []).map((c) => ({ id: c.id as string, fechaLlegada: (c.fecha_llegada as string | null) ?? null, etapa: String(c.etapa ?? "") }));
    const hoy = hoyPanama();
    let activadas = 0;
    for (const t of tareas.filter((x) => llegoLoEsperado(x.compras_esperadas, lista))) {
      const responsable = uno(t.whatsapp_conversaciones)?.asignada_a ?? t.responsable_id;
      // Solo la activa quien la encuentra esperando todavía: si dos se cruzan, el aviso sale una vez.
      const { data: hecha } = await supabase
        .from("tareas_dropshipper")
        .update({ estado: "pendiente", vence: hoy, activada_en: new Date().toISOString(), avisada_en: new Date().toISOString(), responsable_id: responsable })
        .eq("id", t.id)
        .eq("estado", "esperando")
        .select("id");
      if (!hecha?.length) continue;
      activadas++;
      await avisarTarea(supabase, { usuarioId: responsable, titulo: t.titulo, cliente: nombreCliente(t), conversacionId: t.conversacion_id, motivo: "llego" });
    }
    return activadas;
  } catch {
    return 0;
  }
}

/** Avisa a cada responsable las tareas que vencen hoy (o ya vencieron) y todavía no se le avisaron. Para el aviso diario. */
export async function avisarTareasDeHoy(supabase: SupabaseClient): Promise<number> {
  try {
    const hoy = hoyPanama();
    const { data, error } = await supabase.from("tareas_dropshipper").select(CAMPOS).eq("estado", "pendiente").lte("vence", hoy).is("avisada_en", null).limit(500);
    if (error || !data?.length) return 0;
    let avisadas = 0;
    for (const t of data as unknown as FilaTarea[]) {
      const { data: marcada } = await supabase.from("tareas_dropshipper").update({ avisada_en: new Date().toISOString() }).eq("id", t.id).is("avisada_en", null).select("id");
      if (!marcada?.length) continue;
      avisadas++;
      await avisarTarea(supabase, { usuarioId: t.responsable_id, titulo: t.titulo, cliente: nombreCliente(t), conversacionId: t.conversacion_id, motivo: "hoy" });
    }
    return avisadas;
  } catch {
    return 0;
  }
}
