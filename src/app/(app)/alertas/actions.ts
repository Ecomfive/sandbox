"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { upsertAlerta } from "@/lib/alertas/pendientes";
import { requireModuloEscritura } from "@/lib/auth";

export async function generarAlerta(formData: FormData) {
  await requireModuloEscritura("alertas");
  const pais_id = formData.get("pais_id") as string;
  const producto_id = formData.get("producto_id") as string;
  const cantidad = Number(formData.get("cantidad"));

  const supabase = createServiceClient();
  await upsertAlerta(supabase, { pais_id, producto_id, pendiente: cantidad });

  revalidatePath("/alertas");
}

export async function actualizarEstadoAlerta(formData: FormData) {
  await requireModuloEscritura("alertas");
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as "abierta" | "reclamada" | "resuelta";

  const supabase = createServiceClient();
  const patch: Record<string, unknown> = { estado };
  if (estado === "reclamada") {
    patch.fecha_reclamo = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("alertas_inventario_no_retornado").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/alertas");
}

export async function actualizarEstadoAlertasMasivo(ids: string[], estado: "reclamada" | "resuelta") {
  await requireModuloEscritura("alertas");
  if (ids.length === 0) return;

  const supabase = createServiceClient();
  const patch: Record<string, unknown> = { estado };
  if (estado === "reclamada") {
    patch.fecha_reclamo = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("alertas_inventario_no_retornado").update(patch).in("id", ids);
  if (error) throw new Error(error.message);

  revalidatePath("/alertas");
}
