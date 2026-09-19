"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

export async function crearCuentaRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const pais_id = formData.get("pais_id") as string;
  const tipo = formData.get("tipo") as string;
  const nombre = formData.get("nombre") as string;
  const detalle = (formData.get("detalle") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_retiro").insert({ pais_id, tipo, nombre, detalle });
  if (error) throw new Error(error.message);

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
}

export async function alternarActivaCuenta(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const activa = formData.get("activa") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_retiro").update({ activa }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "activar_cuenta_retiro",
    entidad: "cuentas_retiro",
    entidadId: id,
    antes: { Estado: activa ? "Inactiva" : "Activa" },
    despues: { Estado: activa ? "Activa" : "Inactiva" },
  });

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
}
