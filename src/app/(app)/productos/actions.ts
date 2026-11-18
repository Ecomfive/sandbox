"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { filasDePaisesVisibles, filaDePaisPermitida, idsPaisesPermitidos } from "@/lib/seguridad/fila-pais";
import { SIN_ACCESO_PAIS } from "@/lib/seguridad/pais-acceso";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function actualizarProducto(formData: FormData) {
  const usuario = await requireModuloEscritura("productos");
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
  // Solo un producto de un país de la persona (auditoría de seguridad, 18 nov 2026).
  if (!(await filaDePaisPermitida(supabase, usuario.paisesPermitidos, "productos", id))) throw new Error(SIN_ACCESO_PAIS);
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
  const usuario = await requireModuloEscritura("productos");
  if (!Array.isArray(ids) || ids.length > 2000 || !ids.every((i) => typeof i === "string" && UUID.test(i))) throw new Error("Selección no válida.");
  if (typeof margenMinimo !== "number" || !Number.isFinite(margenMinimo) || margenMinimo < 0 || margenMinimo > 100) {
    throw new Error("El margen mínimo debe estar entre 0 y 100.");
  }
  if (ids.length === 0) return;

  const supabase = createServiceClient();
  // Con países limitados, un producto de otro país rechaza todo el lote (auditoría de seguridad, 18 nov 2026).
  const visibles = await idsPaisesPermitidos(supabase, usuario.paisesPermitidos);
  if (visibles !== null) {
    const { data: filas, error: errorLeer } = await supabase.from("productos").select("id, pais_id").in("id", ids);
    if (errorLeer) throw new Error("No se pudo leer la selección.");
    if (filasDePaisesVisibles(filas ?? [], visibles).length !== new Set(ids).size) throw new Error(SIN_ACCESO_PAIS);
  }
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
