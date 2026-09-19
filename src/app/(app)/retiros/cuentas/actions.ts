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

/** Edita a mano cualquier dato de una cuenta ya creada — nombre, cuenta/detalle, tipo o
 * comisión sugerida. Solo actualiza los campos presentes en el formulario, así cada control
 * inline (nombre, comisión, etc.) puede llamarla mandando nada más lo suyo. Cambiar esto no
 * toca los retiros ya creados: cada uno guarda su propia comisión en su propia fila. */
export async function actualizarCuentaRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const cambios: Record<string, string | number | null> = {};
  if (formData.has("nombre")) cambios.nombre = (formData.get("nombre") as string).trim();
  if (formData.has("detalle")) cambios.detalle = (formData.get("detalle") as string).trim() || null;
  if (formData.has("tipo")) cambios.tipo = formData.get("tipo") as string;
  if (formData.has("comision_tipo")) {
    const tipo = (formData.get("comision_tipo") as string) || null;
    cambios.comision_tipo = tipo;
    if (!tipo) cambios.comision_valor = null;
  }
  if (formData.has("comision_valor")) {
    const valor = formData.get("comision_valor") as string;
    cambios.comision_valor = valor === "" ? null : Number(valor);
  }
  if (Object.keys(cambios).length === 0) return;

  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_retiro").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
}

/** Borra la cuenta, salvo que ya tenga retiros asociados — ahí se bloquea con un mensaje claro
 * en vez de romper el historial de esos retiros (que muestran su destino desde esta tabla).
 * Devuelve el error como valor en vez de lanzarlo: en producción, Next.js oculta el mensaje
 * de cualquier excepción de un server action, y este mensaje sí lo necesita ver la persona. */
export async function eliminarCuentaRetiro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("retiros")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_retiro_id", id);
  if (count && count > 0) {
    return {
      error: `No se puede eliminar: tiene ${count} retiro${count === 1 ? "" : "s"} asociado${count === 1 ? "" : "s"}. Desactívala en vez de eliminarla.`,
    };
  }

  const { error } = await supabase.from("cuentas_retiro").delete().eq("id", id);
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "eliminar_cuenta_retiro",
    entidad: "cuentas_retiro",
    entidadId: id,
    detalle: "Cuenta de retiro eliminada",
  });

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
  return {};
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
