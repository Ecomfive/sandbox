"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

export async function crearPatron(formData: FormData) {
  await requireModuloEscritura("extractos");
  const pais_id = formData.get("pais_id") as string;
  const fragmento = (formData.get("fragmento") as string)?.trim();
  const plataforma_id = formData.get("plataforma_id") as string;

  if (!fragmento) throw new Error("Falta el texto del patrón.");

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("patrones_bancarios")
    .upsert({ pais_id, fragmento, plataforma_id }, { onConflict: "pais_id,fragmento" });
  if (error) throw new Error(error.message);

  revalidatePath("/extractos/patrones");
}

export async function eliminarPatron(formData: FormData) {
  await requireModuloEscritura("extractos");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("patrones_bancarios").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/extractos/patrones");
}
