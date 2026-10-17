"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { esUuid } from "@/lib/puestos/puesto";
import { createServiceClient } from "@/lib/supabase/server";

/** «Marcar como leído» de un manual: lo hace cada persona por sí misma (cuenta para su onboarding). */
export async function marcarManualLeido(manualId: string): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." };
  if (!esUuid(manualId)) return { error: "Manual no válido." };
  const supabase = createServiceClient();
  const { data: manual } = await supabase.from("manuales_proceso").select("id").eq("id", manualId).maybeSingle();
  if (!manual) return { error: "El manual ya no existe." };
  const { error } = await supabase.from("manuales_lecturas").upsert({ usuario_id: usuario.id, manual_id: manualId, leido_en: new Date().toISOString() }, { onConflict: "usuario_id,manual_id" });
  if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0112 (Puestos) en Supabase." : "No se pudo marcar como leído." };
  revalidatePath(`/ayuda/manuales/${manualId}`);
  revalidatePath("/mi-puesto");
  revalidatePath("/puestos");
  return {};
}
