"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function registrarGasto(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const categoria = formData.get("categoria") as string;
  const descripcion = formData.get("descripcion") as string;
  const monto = Number(formData.get("monto"));
  const fecha = formData.get("fecha") as string;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gastos")
    .insert({ pais_id, categoria, descripcion, monto, fecha });
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
}

export async function eliminarGasto(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createServiceClient();
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
}
