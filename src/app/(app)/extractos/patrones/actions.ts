"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearPatron(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("extractos");
  const pais_id = formData.get("pais_id") as string;
  const fragmento = String(formData.get("fragmento") ?? "").trim();
  const plataforma_id = formData.get("plataforma_id") as string;

  if (!fragmento) return { error: "Escribe el texto a buscar." };
  if (!plataforma_id) return { error: "Elige la plataforma." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("patrones_bancarios")
    .upsert({ pais_id, fragmento, plataforma_id }, { onConflict: "pais_id,fragmento" });
  if (error) return { error: error.message };

  revalidatePath("/extractos/patrones");
  return {};
}

export async function eliminarPatron(formData: FormData) {
  await requireModuloEscritura("extractos");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("patrones_bancarios").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/extractos/patrones");
}
