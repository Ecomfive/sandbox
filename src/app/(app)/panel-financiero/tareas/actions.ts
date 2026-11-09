"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { TITULO_TAREA, esClaveTarea } from "@/lib/tareas/definiciones";
import { ejecutarTarea } from "@/lib/tareas/ejecutar";

/** Solo quien puede modificar Usuarios y roles ve y corre las tareas programadas. */
const MODULO = "usuarios";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Correr ahora»: la misma ejecución que el cron, registrada como manual. */
export async function correrTareaAhora(clave: unknown): Promise<{ error?: string; resumen?: string; omitida?: boolean }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!esClaveTarea(clave)) return { error: "Tarea inválida." };
    const r = await ejecutarTarea(createServiceClient(), clave, { disparo: "manual", usuarioId: usuario.id });
    await registrarAuditoria({ accion: "correr_tarea_programada", entidad: "fin_tareas_ejecuciones", entidadId: r.id ?? undefined, detalle: `${TITULO_TAREA[clave]}: ${r.error ?? r.resumen}`.slice(0, 1000) });
    revalidatePath("/panel-financiero/tareas");
    revalidatePath("/panel-financiero");
    if (r.error) return { error: r.error };
    return { resumen: r.resumen, omitida: r.omitida };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo correr la tarea." };
  }
}

/** Da una alerta por vista: deja de mostrarse en el Panel (si la situación vuelve a pasar con otra clave, sale otra). */
export async function marcarAlertaVista(id: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Alerta inválida." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_alertas").update({ vista_por: usuario.id, vista_en: new Date().toISOString() }).eq("id", id).is("vista_en", null).select("mensaje").maybeSingle();
    if (error) return { error: "No se pudo marcar." };
    if (data) await registrarAuditoria({ accion: "marcar_alerta_vista", entidad: "fin_alertas", entidadId: id, detalle: String(data.mensaje).slice(0, 500) });
    revalidatePath("/panel-financiero/tareas");
    revalidatePath("/panel-financiero");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo marcar." };
  }
}
