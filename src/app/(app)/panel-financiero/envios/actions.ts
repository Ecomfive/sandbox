"use server";

// «Enviar ahora» del informe mensual por correo (mejora 89) y del resumen semanal por WhatsApp (mejora 90). Piden poder
// modificar el Estado de resultados (los destinatarios se configuran en sus Ajustes). Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerPeriodo } from "@/lib/af4/fecha";
import { enviarInformeCorreo, enviarResumenSemanal } from "@/lib/finanzas/cargar-informe-envio";
import { createServiceClient } from "@/lib/supabase/server";

async function permiso() {
  try {
    return { usuario: await requireModuloEscritura("estado-resultados") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
}

export async function enviarInformeAhora(mesCrudo: unknown): Promise<{ error?: string; resumen?: string }> {
  const p = await permiso();
  if ("error" in p) return { error: p.error };
  const mes = mesCrudo === null || mesCrudo === undefined || mesCrudo === "" ? null : leerPeriodo(mesCrudo);
  const r = await enviarInformeCorreo(createServiceClient(), { disparo: "manual", mes, usuarioId: p.usuario.id, usuarioNombre: p.usuario.nombre ?? p.usuario.email });
  await registrarAuditoria({ accion: "enviar_informe", entidad: "fin_informes_envios", detalle: `Correo: ${r.resumen}`.slice(0, 500) });
  revalidatePath("/panel-financiero/envios");
  return r.ok ? { resumen: r.resumen } : { error: r.resumen };
}

/** Arma el resumen semanal y, con WhatsApp configurado, lo manda; si no, devuelve el texto para mandarlo a mano. */
export async function enviarResumenAhora(): Promise<{ error?: string; resumen?: string; texto?: string; automatico?: boolean }> {
  const p = await permiso();
  if ("error" in p) return { error: p.error };
  const r = await enviarResumenSemanal(createServiceClient(), { disparo: "manual", usuarioId: p.usuario.id, usuarioNombre: p.usuario.nombre ?? p.usuario.email });
  if (r.automatico) await registrarAuditoria({ accion: "enviar_informe", entidad: "fin_informes_envios", detalle: `WhatsApp: ${r.resumen}`.slice(0, 500) });
  revalidatePath("/panel-financiero/envios");
  return r.ok ? { resumen: r.resumen, texto: r.texto, automatico: r.automatico } : { error: r.resumen, texto: r.texto, automatico: r.automatico };
}
