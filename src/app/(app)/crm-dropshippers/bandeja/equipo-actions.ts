"use server";

import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { accesoCrm, ACCIONES_COMERCIALES } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { ordenarEventos, type EventoEquipo } from "@/lib/whatsapp/actividad-equipo";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

/** Cuántos eventos se traen de una vez. */
const POR_VEZ = 15;

/**
 * Lo que no sale en «Actividad del equipo»: lo que ya se ve en el chat (archivos y plantillas mandados) y abrir el chat, que pasa a cada rato.
 * Los mensajes del equipo tampoco salen (29 oct 2026, pedido de Alcides): están en el chat, al lado.
 */
const NO_SALEN = ["enviar_archivo_whatsapp", "enviar_plantilla_whatsapp", "marcar_leido_whatsapp"];

export interface ActividadDelEquipo {
  eventos: EventoEquipo[];
  /** Hay eventos más viejos: «Ver más». */
  hayMas: boolean;
}

/**
 * Qué hizo cada persona del equipo con este cliente (29 oct 2026, pedido de Alcides): lo que quedó en la auditoría del chat (cambió el nombre, lo vinculó,
 * lo pasó de área, lo resolvió, lo tomó, sus etiquetas…) y de su dropshipper (creó un caso o un pedido, editó sus datos, cambió su estado o fase…), con lo de
 * antes → lo de después. No repite los mensajes del chat. Lo comercial (seguimientos, transferencias, escalados) solo lo ve Comercial. Del más nuevo al más
 * viejo; con `antesDe`, los anteriores a esa hora. Basta poder abrir el chat.
 */
export async function actividadDelEquipo(conversacionId: string, antesDe?: string): Promise<ActividadDelEquipo | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const ocultas = [...NO_SALEN, ...(accesoCrm(u).comercial ? [] : ACCIONES_COMERCIALES)];
  // Los dos ids vienen de la base (UUID), así que se pueden poner en el filtro.
  const de = [`and(entidad.eq.whatsapp_conversaciones,entidad_id.eq.${c.id})`];
  if (c.dropshipperId && /^[0-9a-f-]{36}$/i.test(c.dropshipperId)) de.push(`and(entidad.eq.dropshippers,entidad_id.eq.${c.dropshipperId})`);
  let consulta = supabase
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .or(de.join(","))
    .not("accion", "in", `(${ocultas.join(",")})`);
  const hasta = antesDe && !Number.isNaN(Date.parse(antesDe)) ? new Date(antesDe).toISOString() : null;
  if (hasta) consulta = consulta.lt("creado_en", hasta);
  const { data, error } = await consulta.order("creado_en", { ascending: false }).limit(POR_VEZ + 1);
  if (error) return { error: "No se pudo cargar la actividad." };

  const eventos: EventoEquipo[] = (data ?? []).map((x) => ({
    id: `a-${x.id}`,
    quien: (x.usuario_nombre as string | null) || "Sistema",
    momento: x.creado_en as string,
    clase: "cambio",
    texto: formatearEventoAuditoria({
      accion: x.accion as string,
      usuario_nombre: null,
      detalle: (x.detalle as string | null) ?? null,
      antes: (x.antes as Record<string, string> | null) ?? null,
      despues: (x.despues as Record<string, string> | null) ?? null,
    }),
  }));
  const todos = ordenarEventos(eventos);
  return { eventos: todos.slice(0, POR_VEZ), hayMas: todos.length > POR_VEZ };
}
