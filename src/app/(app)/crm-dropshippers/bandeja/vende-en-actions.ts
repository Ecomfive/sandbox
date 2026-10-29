"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { nombrePais } from "@/lib/paises-mundo";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const FALTA_0193 = "Falta correr en Supabase la migración 0193 (dónde vende).";

/** Las plataformas y los países que se pueden elegir en «Dónde vende». */
export async function opcionesVendeEn(): Promise<{ plataformas: string[]; paises: { codigo: string; nombre: string }[] } | { error: string }> {
  if (!(await usuarioBandeja(false))) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const [p, x] = await Promise.all([supabase.from("plataformas").select("nombre").order("nombre"), supabase.from("paises").select("codigo, nombre").order("nombre")]);
  if (p.error || x.error) return { error: "No se pudieron cargar las opciones." };
  return { plataformas: (p.data ?? []).map((r) => r.nombre as string), paises: (x.data ?? []).map((r) => ({ codigo: r.codigo as string, nombre: r.nombre as string })) };
}

/**
 * Pone o quita, a mano, una plataforma en un país en «Dónde vende» del dropshipper de un chat (29 oct 2026, pedido de Alcides). Pide poder escribir en
 * el área del chat y que el chat tenga dropshipper; lo de sus cuentas vinculadas no se quita aquí. Queda en la auditoría del dropshipper.
 */
export async function cambiarVendeEn(conversacionId: string, plataforma: string, pais: string, poner: boolean): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const chat = await conversacionPermitida(supabase, conversacionId, u, true);
  if (!chat) return { error: "Esa conversación no existe o no es de tu área." };
  if (!chat.dropshipperId) return { error: "Primero vincula el chat con su dropshipper." };
  const [p, x] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").eq("nombre", String(plataforma)).maybeSingle(),
    supabase.from("paises").select("id, codigo").eq("codigo", String(pais)).maybeSingle(),
  ]);
  if (!p.data || !x.data) return { error: "Elige una plataforma y un país de la lista." };
  const fila = { dropshipper_id: chat.dropshipperId, plataforma_id: p.data.id as string, pais_id: x.data.id as string };
  const r = poner
    ? await supabase.from("dropshipper_vende_en").upsert({ ...fila, creado_por: u.id }, { onConflict: "dropshipper_id,plataforma_id,pais_id", ignoreDuplicates: true })
    : await supabase.from("dropshipper_vende_en").delete().match(fila);
  if (r.error) return { error: r.error.code === "42P01" ? FALTA_0193 : "No se pudo guardar." };
  const donde = `${p.data.nombre} ${nombrePais(x.data.codigo as string)}`;
  await registrarAuditoria({ accion: "vende_en_dropshipper", entidad: "dropshippers", entidadId: chat.dropshipperId, detalle: poner ? `Agregó ${donde}` : `Quitó ${donde}` });
  await avisarBandeja();
  return { ok: true };
}
