"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";

export async function actualizarProducto(formData: FormData) {
  const id = formData.get("id") as string;
  const costoRaw = formData.get("costo") as string;
  const precioRaw = formData.get("precio_actual") as string;
  const margenMinimoRaw = formData.get("margen_minimo") as string;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("productos")
    .update({
      costo: costoRaw === "" ? null : Number(costoRaw),
      precio_actual: precioRaw === "" ? null : Number(precioRaw),
      margen_minimo: Number(margenMinimoRaw),
      ultima_modificacion_precio: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await registrarAuditoria({
    accion: "actualizar_margen",
    entidad: "productos",
    entidadId: id,
    detalle: `costo=${costoRaw || "—"} precio=${precioRaw || "—"} margen_minimo=${margenMinimoRaw}%`,
  });

  revalidatePath("/productos");
}

export async function actualizarMargenMasivo(ids: string[], margenMinimo: number) {
  if (ids.length === 0) return;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("productos")
    .update({ margen_minimo: margenMinimo })
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  await registrarAuditoria({
    accion: "actualizar_margen_masivo",
    entidad: "productos",
    detalle: `${ids.length} producto(s) -> margen_minimo=${margenMinimo}%`,
  });

  revalidatePath("/productos");
}
