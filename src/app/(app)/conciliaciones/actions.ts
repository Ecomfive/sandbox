"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";
import { SIN_ACCESO_PAIS, puedeVerPaisId } from "@/lib/seguridad/pais-acceso";

export async function upsertConciliacion(formData: FormData) {
  const usuario = await requireModuloEscritura("conciliaciones");
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const periodo = formData.get("periodo") as string;
  const monto_bancario = Number(formData.get("monto_bancario"));
  const monto_reportado_plataforma = Number(formData.get("monto_reportado_plataforma"));
  const notas = (formData.get("notas") as string) || null;

  const supabase = createServiceClient();
  // El país llega del navegador: solo uno de los que la persona puede ver (auditoría de seguridad, 18 nov 2026).
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais_id))) throw new Error(SIN_ACCESO_PAIS);
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
