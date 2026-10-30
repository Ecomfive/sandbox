import type { SupabaseClient } from "@supabase/supabase-js";
import { PASOS_ALTA, pasoDeHoy } from "./automatizar";

const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/**
 * La secuencia de alta (Dirección › Automatizaciones, fase 4, migración 0204). Corre una vez al día (cron de notificaciones, antes de avisar
 * las tareas de hoy, así el aviso llega por la campana). **Solo si está encendida**: a cada dropshipper creado desde que se encendió le crea la
 * tarea del paso que toca (día 1, 3, 7 o 14) hasta su primer pedido, para quien lo lleva o, si nadie, para la persona elegida. Cada paso se
 * crea una sola vez (`crm_alta_pasos`). Devuelve cuántas tareas creó; si algo falla, 0 (no frena el resto del cron).
 */
export async function correrSecuenciaAlta(supabase: SupabaseClient): Promise<number> {
  try {
    const { data: auto } = await supabase.from("crm_automatizaciones").select("encendida, config, encendida_en").eq("clave", "secuencia_alta").maybeSingle();
    if (!auto?.encendida || !auto.encendida_en) return 0;
    const porDefecto = ((auto.config ?? {}) as { responsable_id?: string }).responsable_id ?? null;
    const desde = new Date(Math.max(Date.parse(auto.encendida_en as string), Date.now() - 21 * 86_400_000)).toISOString();
    const { data: ds } = await supabase.from("dropshippers").select("id, nombre, responsable_id, creado_en").gte("creado_en", desde).limit(500);
    if (!ds?.length) return 0;
    const ids = ds.map((d) => d.id as string);
    const [{ data: pasos }, { data: cuentas }, { data: chats }] = await Promise.all([
      supabase.from("crm_alta_pasos").select("dropshipper_id, paso").in("dropshipper_id", ids),
      supabase.from("dropshipper_cuentas").select("dropshipper_id, plataforma_id, pais_id, id_externo").in("dropshipper_id", ids),
      supabase.from("whatsapp_conversaciones").select("id, dropshipper_id").in("dropshipper_id", ids).is("oculta_en", null),
    ]);
    // Si ya hizo su primer pedido (en cualquiera de sus cuentas), la secuencia termina.
    const conPedido = new Set<string>();
    const externos = [...new Set((cuentas ?? []).map((c) => c.id_externo as string))];
    if (externos.length) {
      const { data: ordenes } = await supabase.from("crm_ordenes").select("plataforma_id, pais_id, usuario_externo, estado").in("usuario_externo", externos).limit(5000);
      for (const o of ordenes ?? []) {
        if (String(o.estado ?? "").toUpperCase().startsWith("CANCELADO")) continue;
        const c = (cuentas ?? []).find((x) => x.id_externo === o.usuario_externo && x.plataforma_id === o.plataforma_id && x.pais_id === o.pais_id);
        if (c) conPedido.add(c.dropshipper_id as string);
      }
    }
    const hechos = new Map<string, number[]>();
    for (const p of pasos ?? []) hechos.set(p.dropshipper_id as string, [...(hechos.get(p.dropshipper_id as string) ?? []), Number(p.paso)]);
    const chatDe = new Map((chats ?? []).map((c) => [c.dropshipper_id as string, c.id as string]));
    const hoy = hoyPanama();
    let creadas = 0;
    for (const d of ds) {
      const id = d.id as string;
      const { crear, saltar } = pasoDeHoy(diasEntre(diaPanama(d.creado_en as string), hoy), hechos.get(id) ?? [], conPedido.has(id));
      if (saltar.length) await supabase.from("crm_alta_pasos").upsert(saltar.map((paso) => ({ dropshipper_id: id, paso })), { onConflict: "dropshipper_id,paso", ignoreDuplicates: true });
      const responsable = (d.responsable_id as string | null) ?? porDefecto;
      if (crear === null || !responsable) continue;
      // Primero se reserva el paso: si dos corridas coinciden, solo una crea la tarea.
      const { data: reservado } = await supabase.from("crm_alta_pasos").upsert({ dropshipper_id: id, paso: crear }, { onConflict: "dropshipper_id,paso", ignoreDuplicates: true }).select("paso");
      if (!reservado?.length) continue;
      const paso = PASOS_ALTA.find((p) => p.dia === crear)!;
      const { data: tarea } = await supabase
        .from("tareas_dropshipper")
        .insert({
          dropshipper_id: id,
          conversacion_id: chatDe.get(id) ?? null,
          titulo: `Día ${paso.dia} · ${paso.titulo}: ${d.nombre}`.slice(0, 200),
          detalle: `${paso.detalle}\nSecuencia de alta (Dirección › Automatizaciones): se detiene sola cuando haga su primer pedido.`,
          vence: hoy,
          origen: "alta",
          responsable_id: responsable,
        })
        .select("id")
        .single();
      if (!tarea) continue;
      await supabase.from("crm_alta_pasos").update({ tarea_id: tarea.id }).eq("dropshipper_id", id).eq("paso", crear);
      creadas++;
    }
    return creadas;
  } catch {
    return 0;
  }
}
