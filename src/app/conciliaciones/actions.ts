"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function upsertConciliacion(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const periodo = formData.get("periodo") as string;
  const monto_bancario = Number(formData.get("monto_bancario"));
  const monto_reportado_plataforma = Number(formData.get("monto_reportado_plataforma"));
  const notas = (formData.get("notas") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase.from("conciliaciones").upsert(
    {
      pais_id,
      plataforma_id,
      periodo,
      monto_bancario,
      monto_reportado_plataforma,
      notas,
    },
    { onConflict: "pais_id,plataforma_id,periodo" }
  );
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/conciliaciones");
}
