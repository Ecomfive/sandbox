"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca o desmarca a una persona como líder que asigna tareas a otras (Configuración, migración 0263, 9 nov 2026). Devuelve el error como valor. */
export async function cambiarLiderTareas(perfilId: string, activo: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  if (!UUID.test(perfilId) || typeof activo !== "boolean") return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errLeer } = await supabase.from("perfiles").select("nombre, email, lider_tareas").eq("id", perfilId).maybeSingle();
  if (errLeer) return { error: errLeer.code === "42703" ? "Falta correr la migración 0263 en Supabase." : errLeer.message };
  if (!antes) return { error: "No se encontró a esa persona." };
  if (antes.lider_tareas === activo) return {};
  const { error } = await supabase.from("perfiles").update({ lider_tareas: activo }).eq("id", perfilId);
  if (error) return { error: error.message };
  await registrarAuditoria({
    accion: "lider_tareas",
    entidad: "perfiles",
    entidadId: perfilId,
    detalle: `${activo ? "Marcó" : "Quitó"} como líder que asigna tareas a ${antes.nombre || antes.email}`,
    antes: { "Líder: asigna tareas": antes.lider_tareas ? "Sí" : "No" },
    despues: { "Líder: asigna tareas": activo ? "Sí" : "No" },
  });
  revalidatePath("/configuracion");
  return {};
}
