"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enciende o apaga el aviso de 5 minutos sin actividad de una persona (Configuración, migración 0249). Devuelve el error como valor. */
export async function cambiarAvisoInactividad(perfilId: string, activo: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  if (!UUID.test(perfilId) || typeof activo !== "boolean") return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errLeer } = await supabase.from("perfiles").select("nombre, email, aviso_inactividad").eq("id", perfilId).maybeSingle();
  if (errLeer) return { error: errLeer.code === "42703" ? "Falta correr la migración 0249 en Supabase." : errLeer.message };
  if (!antes) return { error: "No se encontró a esa persona." };
  if (antes.aviso_inactividad === activo) return {};
  const { error } = await supabase.from("perfiles").update({ aviso_inactividad: activo }).eq("id", perfilId);
  if (error) return { error: error.message };
  await registrarAuditoria({
    accion: "aviso_inactividad",
    entidad: "perfiles",
    entidadId: perfilId,
    detalle: `${activo ? "Activó" : "Quitó"} el aviso de inactividad de ${antes.nombre || antes.email}`,
    antes: { "Aviso de inactividad": antes.aviso_inactividad ? "Sí" : "No" },
    despues: { "Aviso de inactividad": activo ? "Sí" : "No" },
  });
  revalidatePath("/configuracion");
  return {};
}
