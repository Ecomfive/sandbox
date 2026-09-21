"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

export async function actualizarProducto(formData: FormData) {
  await requireModuloEscritura("productos");
  const id = formData.get("id") as string;
  const costoRaw = formData.get("costo") as string;
  const precioRaw = formData.get("precio_actual") as string;
  const margenMinimoRaw = formData.get("margen_minimo") as string;

  // Una acción del servidor es un punto de entrada público: no basta con lo que valida el navegador.
  const costo = costoRaw === "" ? null : Number(costoRaw);
  const precio = precioRaw === "" ? null : Number(precioRaw);
  const margenMinimo = Number(margenMinimoRaw);
  if (!id) throw new Error("Falta el producto.");
  // Un campo ausente no es un campo vacío: sin esto, un formulario sin «costo» lo dejaría en 0.
  if (!formData.has("costo") || !formData.has("precio_actual") || !formData.has("margen_minimo")) {
    throw new Error("Faltan datos del producto.");
  }
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) throw new Error("El costo no es válido.");
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) throw new Error("El precio no es válido.");
  if (margenMinimoRaw === "" || !Number.isFinite(margenMinimo) || margenMinimo < 0 || margenMinimo > 100) {
    throw new Error("El margen mínimo debe estar entre 0 y 100.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("productos")
    .update({
      costo,
      precio_actual: precio,
      margen_minimo: margenMinimo,
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
  await requireModuloEscritura("productos");
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
