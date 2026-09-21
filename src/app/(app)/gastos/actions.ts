"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function registrarGasto(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("gastos");
  const pais_id = formData.get("pais_id") as string;
  const categoria = formData.get("categoria") as string;
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const monto = Number(formData.get("monto"));
  const fecha = formData.get("fecha") as string;

  // Lo que la ficha ya exige: se vuelve a comprobar aquí porque una acción se puede invocar sin pasar por ella.
  if (!descripcion) return { error: "Escribe la descripción del gasto." };
  if (!(monto > 0)) return { error: "El monto debe ser mayor a cero." };
  if (!fecha) return { error: "Elige la fecha del gasto." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gastos")
    .insert({ pais_id, categoria, descripcion, monto, fecha });
  if (error) return { error: error.message };
  revalidatePath("/gastos");
  return {};
}

export async function eliminarGasto(formData: FormData) {
  await requireModuloEscritura("gastos");
  const id = formData.get("id") as string;
  const supabase = createServiceClient();
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
}
