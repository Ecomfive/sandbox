"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";

export async function alternarDisponiblePlataforma(formData: FormData) {
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
    detalle: `disponible_para_retiro=${disponible}`,
  });

  revalidatePath("/configuracion");
  revalidatePath("/retiros");
}
