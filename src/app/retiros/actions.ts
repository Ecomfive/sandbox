"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function registrarSaldo(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const monto = Number(formData.get("monto"));
  const fecha = formData.get("fecha") as string;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("saldos_wallet")
    .upsert({ pais_id, plataforma_id, monto, fecha }, { onConflict: "pais_id,plataforma_id,fecha" });
  if (error) throw new Error(error.message);
  revalidatePath("/retiros");
}

export async function registrarRetiro(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const monto = Number(formData.get("monto"));
  const fecha = formData.get("fecha") as string;
  const estado = formData.get("estado") as string;
  const notas = (formData.get("notas") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("retiros")
    .insert({ pais_id, plataforma_id, monto, fecha, estado, notas });
  if (error) throw new Error(error.message);
  revalidatePath("/retiros");
}

export async function actualizarEstadoRetiro(formData: FormData) {
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("retiros").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/retiros");
}
