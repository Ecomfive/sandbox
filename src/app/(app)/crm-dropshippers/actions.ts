"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function crearDropshipper(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const contacto_email = (formData.get("contacto_email") as string) || null;
  const contacto_telefono = (formData.get("contacto_telefono") as string) || null;

  if (!nombre) throw new Error("Falta el nombre del dropshipper.");

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("dropshippers")
    .insert({ pais_id, nombre, contacto_email, contacto_telefono });
  if (error) throw new Error(error.message);
  revalidatePath("/crm-dropshippers");
}

export async function actualizarDropshipper(formData: FormData) {
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

export async function registrarInteraccion(formData: FormData) {
  const dropshipper_id = formData.get("dropshipper_id") as string;
  const fecha = formData.get("fecha") as string;
  const tipo = formData.get("tipo") as string;
  const nota = (formData.get("nota") as string)?.trim();

  if (!nota) throw new Error("Falta la nota de la interacción.");

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("interacciones_dropshipper")
    .insert({ dropshipper_id, fecha, tipo, nota });
  if (error) throw new Error(error.message);
  revalidatePath("/crm-dropshippers");
}
