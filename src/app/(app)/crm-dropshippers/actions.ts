"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearDropshipper(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const pais_id = formData.get("pais_id") as string;
  const nombre = String(formData.get("nombre") ?? "").trim();
  const contacto_email = (formData.get("contacto_email") as string) || null;
  const contacto_telefono = (formData.get("contacto_telefono") as string) || null;

  if (!nombre) return { error: "Escribe el nombre del dropshipper." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("dropshippers")
    .insert({ pais_id, nombre, contacto_email, contacto_telefono });
  if (error) return { error: error.message };
  revalidatePath("/crm-dropshippers");
  return {};
}

export async function actualizarDropshipper(formData: FormData) {
  await requireModuloEscritura("crm-dropshippers");
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;
  const volumenRaw = formData.get("volumen_mensual_estimado") as string;
  const notas = (formData.get("notas") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("dropshippers")
    .update({
      estado,
      volumen_mensual_estimado: volumenRaw === "" ? null : Number(volumenRaw),
      notas,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/crm-dropshippers");
}

/** Devuelve el error como valor, no lo lanza (ver `crearDropshipper`). */
export async function registrarInteraccion(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const dropshipper_id = formData.get("dropshipper_id") as string;
  const fecha = formData.get("fecha") as string;
  const tipo = formData.get("tipo") as string;
  const nota = String(formData.get("nota") ?? "").trim();

  if (!dropshipper_id) return { error: "Elige el dropshipper." };
  if (!nota) return { error: "Escribe la nota de la interacción." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("interacciones_dropshipper")
    .insert({ dropshipper_id, fecha, tipo, nota });
  if (error) return { error: error.message };
  revalidatePath("/crm-dropshippers");
  return {};
}
