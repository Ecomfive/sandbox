"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { puedeVerPaisId, SIN_ACCESO_PAIS } from "@/lib/seguridad/pais-acceso";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearPatron(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("extractos");
  const pais_id = formData.get("pais_id") as string;
  const fragmento = String(formData.get("fragmento") ?? "").trim();
  const plataforma_id = formData.get("plataforma_id") as string;

  if (!fragmento) return { error: "Escribe el texto a buscar." };
  if (!plataforma_id) return { error: "Elige la plataforma." };

  const supabase = createServiceClient();
  // Solo en un país que la persona tiene (auditoría del 27 oct 2026).
  if (!esUuid(pais_id) || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais_id))) return { error: SIN_ACCESO_PAIS };
  const { error } = await supabase
    .from("patrones_bancarios")
    .upsert({ pais_id, fragmento, plataforma_id }, { onConflict: "pais_id,fragmento" });
  if (error) return { error: error.message };

  revalidatePath("/extractos/patrones");
  return {};
}

export async function eliminarPatron(formData: FormData) {
  const usuario = await requireModuloEscritura("extractos");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  if (!esUuid(id)) throw new Error("Patrón no válido.");
  const { data: patron } = await supabase.from("patrones_bancarios").select("pais_id").eq("id", id).maybeSingle();
  if (!patron || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, patron.pais_id as string))) throw new Error(SIN_ACCESO_PAIS);
  const { error } = await supabase.from("patrones_bancarios").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/extractos/patrones");
}
