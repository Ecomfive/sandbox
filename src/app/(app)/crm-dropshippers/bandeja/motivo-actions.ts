"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { clasificarChats, ultimoTextoDelCliente } from "@/lib/whatsapp/clasificar";
import { esGrupo, grupoPorId } from "@/lib/whatsapp/prioridad";
import { proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { areasDe, conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

// La prioridad de los chats (migración 0189): el equipo corrige el motivo que leyó la IA y puede pedir que se lean los chats que esperan sin motivo.

/** Corrige el motivo de un chat con un toque. Queda como «puesto por una persona» (la IA no lo cambia mientras el cliente siga esperando) y se guarda de ejemplo para la IA. */
export async function cambiarMotivoChat(id: string, grupo: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!esGrupo(grupo)) return { error: "Motivo no válido." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, id, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  const antes = await supabase.from("whatsapp_conversaciones").select("motivo_grupo, motivo_por").eq("id", id).maybeSingle();
  if (antes.error) return { error: "Falta correr la migración 0189 (prioridad de los chats)." };
  const nombre = u.nombre ?? u.email;
  const { error } = await supabase
    .from("whatsapp_conversaciones")
    .update({ motivo_grupo: grupo, motivo: null, motivo_resumen: null, motivo_por: "persona", motivo_por_nombre: nombre, motivo_en: new Date().toISOString(), motivo_pedido_en: null })
    .eq("id", id);
  if (error) return { error: "No se pudo cambiar el motivo." };
  const anterior = (antes.data?.motivo_grupo as string | null) ?? null;
  // Solo enseña a la IA cuando corrige lo que ella dijo.
  if (anterior !== grupo && antes.data?.motivo_por === "ia") {
    await supabase.from("whatsapp_motivo_correcciones").insert({
      conversacion_id: id,
      grupo_ia: anterior,
      grupo_nuevo: grupo,
      texto_cliente: await ultimoTextoDelCliente(supabase, id),
      corregido_por: u.id,
      corregido_por_nombre: nombre,
    });
  }
  await registrarAuditoria({
    accion: "motivo_chat_whatsapp",
    entidad: "whatsapp_conversaciones",
    entidadId: id,
    detalle: `${grupoPorId(anterior)?.etiqueta ?? "Sin motivo"} → ${grupoPorId(grupo)?.etiqueta ?? grupo}`,
  });
  await avisarBandeja();
  return { ok: true };
}

/** Cuántos chats se leen como mucho en un toque de «Clasificar». */
const MAX_POR_TOQUE = 15;

/** Lee con la IA el motivo de los chats de tus áreas que esperan respuesta y todavía no lo tienen (o lo tienen de una espera anterior). */
export async function clasificarChatsPendientes(): Promise<{ clasificados: number; quedan: number } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (proveedorTexto() === null) return { error: "Falta conectar la IA (OPENAI_API_KEY o ANTHROPIC_API_KEY)." };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, esperando_desde, motivo_en")
    .in("area", areasDe(u))
    .not("esperando_desde", "is", null)
    .is("oculta_en", null)
    .order("esperando_desde", { ascending: true })
    .limit(500);
  if (error) return { error: "Falta correr la migración 0189 (prioridad de los chats)." };
  const sinMotivo = (data ?? []).filter((c) => !c.motivo_en || Date.parse(c.motivo_en as string) < Date.parse(c.esperando_desde as string)).map((c) => c.id as string);
  const tanda = sinMotivo.slice(0, MAX_POR_TOQUE);
  const clasificados = await clasificarChats(supabase, tanda, {
    operacion: "motivo_chat_whatsapp",
    modulo: "crm-dropshippers",
    usuario: { id: u.id, nombre: u.nombre ?? null, email: u.email },
  });
  if (clasificados) await avisarBandeja();
  return { clasificados, quedan: Math.max(0, sinMotivo.length - clasificados) };
}
