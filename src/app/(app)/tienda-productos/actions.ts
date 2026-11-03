"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Une una variante de Shopify con un producto nuestro (o la deja sin unir con `skuId` null). La unión vive en el sistema: en Shopify no se cambia nada.
 * Al unirla deja de estar marcada como «no sale de bodega».
 */
export async function vincularVariante(varianteId: string, skuId: string | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId) || (skuId !== null && !uuid(skuId))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
  }
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ sku_maestro_id: skuId, no_fisico: false, vinculado_por: skuId ? usuario.id : null, vinculado_en: skuId ? new Date().toISOString() : null })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/tienda-productos");
  return {};
}

/** Marca (o desmarca) una variante como algo que no sale de bodega (garantía extendida, envío prioritario…): no se vincula ni cuenta como vendido. */
export async function marcarNoFisico(varianteId: string, noFisico: boolean): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("tienda-productos");
  if (!uuid(varianteId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("tienda_variantes")
    .update({ no_fisico: noFisico, sku_maestro_id: null, vinculado_por: noFisico ? usuario.id : null, vinculado_en: noFisico ? new Date().toISOString() : null })
    .eq("id", varianteId);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/tienda-productos");
  return {};
}
