"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearPlataforma(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  const pais_id = formData.get("pais_id") as string;
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre de la plataforma es obligatorio." };

  const supabase = createServiceClient();

  const { data: existente, error: errorBuscar } = await supabase
    .from("plataformas")
    .select("id")
    .eq("nombre", nombre)
    .maybeSingle();
  if (errorBuscar) return { error: errorBuscar.message };

  let plataforma_id = existente?.id as string | undefined;
  if (!plataforma_id) {
    const { data: nueva, error: errorCrear } = await supabase
      .from("plataformas")
      .insert({ nombre })
      .select("id")
      .single();
    if (errorCrear || !nueva) return { error: errorCrear?.message ?? "No se pudo crear la plataforma." };
    plataforma_id = nueva.id;
  }

  const { error } = await supabase
    .from("pais_plataformas")
    .upsert(
      { pais_id, plataforma_id, disponible_para_retiro: true },
      { onConflict: "pais_id,plataforma_id" }
    );
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "crear_plataforma",
    entidad: "plataformas",
    entidadId: plataforma_id,
    detalle: `nombre=${nombre}`,
  });

  revalidatePath("/configuracion");
  revalidatePath("/retiros");
  return {};
}

export async function alternarDisponiblePlataforma(formData: FormData) {
  await requireModuloEscritura("configuracion");
  const id = formData.get("id") as string;
  const disponible = formData.get("disponible") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("pais_plataformas")
    .update({ disponible_para_retiro: disponible })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "configurar_plataforma_retiro",
    entidad: "pais_plataformas",
    entidadId: id,
    antes: { "Disponible para crear": disponible ? "Oculta" : "Disponible" },
    despues: { "Disponible para crear": disponible ? "Disponible" : "Oculta" },
  });

  revalidatePath("/configuracion");
  revalidatePath("/retiros");
}
