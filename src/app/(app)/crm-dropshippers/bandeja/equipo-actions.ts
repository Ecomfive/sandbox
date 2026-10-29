"use server";

import { ETIQUETA_ACCION } from "@/lib/auditoria-cambios";
import { createServiceClient } from "@/lib/supabase/server";
import { ACCIONES_YA_EN_MENSAJES, eventoDeAuditoria, eventoDeMensaje, ordenarEventos, type EventoEquipo } from "@/lib/whatsapp/actividad-equipo";
import { mensajesOcultos } from "@/lib/whatsapp/ocultos";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

/** Cuántos eventos se traen de una vez. */
const POR_VEZ = 15;

export interface ActividadDelEquipo {
  eventos: EventoEquipo[];
  /** Hay eventos más viejos: «Ver más». */
  hayMas: boolean;
}

/**
 * Qué hizo cada persona del equipo en este chat (29 oct 2026): sus respuestas, notas, archivos y plantillas (de los mensajes) y lo que quedó en la auditoría (cambió el nombre,
 * vinculó el chat, lo pasó de área, lo resolvió, lo tomó…). Del más nuevo al más viejo; con `antesDe`, los anteriores a esa hora. Basta poder abrir el chat. Lo que se hizo antes de
 * que existiera este registro (marcar leído, resolver, tomar) no está en la auditoría y no sale.
 */
export async function actividadDelEquipo(conversacionId: string, antesDe?: string): Promise<ActividadDelEquipo | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const limite = POR_VEZ + 1;
  const hasta = antesDe && !Number.isNaN(Date.parse(antesDe)) ? new Date(antesDe).toISOString() : null;

  let mensajes = supabase
    .from("whatsapp_mensajes")
    .select("id, direccion, tipo, texto, autor_nombre, momento")
    .eq("conversacion_id", c.id)
    .in("direccion", ["saliente", "nota"])
    .not("autor_nombre", "is", null);
  let auditoria = supabase
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, creado_en")
    .eq("entidad", "whatsapp_conversaciones")
    .eq("entidad_id", c.id)
    .not("accion", "in", `(${ACCIONES_YA_EN_MENSAJES.join(",")})`);
  if (hasta) {
    mensajes = mensajes.lt("momento", hasta);
    auditoria = auditoria.lt("creado_en", hasta);
  }
  const [m, a, ocultos] = await Promise.all([
    mensajes.order("momento", { ascending: false }).limit(limite),
    auditoria.order("creado_en", { ascending: false }).limit(limite),
    mensajesOcultos(supabase, c.id),
  ]);

  const deMensajes = (m.error ? [] : (m.data ?? []))
    .filter((x) => !ocultos.has(x.id as string))
    .map((x) =>
      eventoDeMensaje({ id: x.id as string, direccion: x.direccion as string, tipo: x.tipo as string, texto: (x.texto as string | null) ?? null, autor: (x.autor_nombre as string | null) ?? null, momento: x.momento as string }),
    )
    .filter((e): e is EventoEquipo => e !== null);
  const deAuditoria = (a.error ? [] : (a.data ?? [])).map((x) =>
    eventoDeAuditoria({ id: String(x.id), accion: x.accion as string, usuario: (x.usuario_nombre as string | null) ?? null, detalle: (x.detalle as string | null) ?? null, momento: x.creado_en as string }, ETIQUETA_ACCION),
  );
  const todos = ordenarEventos([...deMensajes, ...deAuditoria]);
  const hayMas = todos.length > POR_VEZ || (m.data?.length ?? 0) >= limite || (a.data?.length ?? 0) >= limite;
  return { eventos: todos.slice(0, POR_VEZ), hayMas };
}
