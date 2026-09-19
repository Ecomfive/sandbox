"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

function generarCodigo(prefijo: "MSK" | "CMB") {
  return `${prefijo}-${Date.now().toString(36).toUpperCase()}`;
}

export async function crearSkuSimple(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const nombre = (formData.get("nombre") as string).trim();
  const codigoManual = (formData.get("codigo") as string)?.trim();

  const supabase = createServiceClient();
  const { error } = await supabase.from("skus_maestros").insert({
    codigo: codigoManual || generarCodigo("MSK"),
    nombre,
    tipo: "simple",
    estado: "propuesto",
    creado_por: usuario.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/catalogo-maestro");
}

export async function crearCombo(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const nombre = (formData.get("nombre") as string).trim();
  const codigoManual = (formData.get("codigo") as string)?.trim();
  const componenteIds = formData.getAll("componente_id") as string[];
  const cantidades = formData.getAll("cantidad") as string[];

  const componentes = componenteIds
    .map((id, i) => ({ id, cantidad: Number(cantidades[i]) || 0 }))
    .filter((c) => c.id && c.cantidad > 0);

  if (componentes.length === 0) {
    throw new Error("Un combo necesita al menos un componente con cantidad mayor a cero.");
  }

  const supabase = createServiceClient();
  const { data: combo, error } = await supabase
    .from("skus_maestros")
    .insert({
      codigo: codigoManual || generarCodigo("CMB"),
      nombre,
      tipo: "combo",
      estado: "propuesto",
      creado_por: usuario.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: errorComponentes } = await supabase.from("sku_maestro_componentes").insert(
    componentes.map((c) => ({
      combo_id: combo.id,
      componente_id: c.id,
      cantidad: c.cantidad,
    }))
  );

  if (errorComponentes) throw new Error(errorComponentes.message);
  revalidatePath("/catalogo-maestro");
}

const TRANSICIONES: Record<string, string[]> = {
  propuesto: ["en_revision"],
  en_revision: ["propuesto", "aprobado"],
  aprobado: ["en_revision"],
};

export async function cambiarEstadoSku(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const id = formData.get("id") as string;
  const nuevoEstado = formData.get("nuevo_estado") as string;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("estado").eq("id", id).single();
  if (!actual || !TRANSICIONES[actual.estado]?.includes(nuevoEstado)) {
    throw new Error(`Transición inválida: ${actual?.estado} → ${nuevoEstado}`);
  }

  const { error } = await supabase
    .from("skus_maestros")
    .update({
      estado: nuevoEstado,
      aprobado_por: nuevoEstado === "aprobado" ? usuario.id : null,
      aprobado_en: nuevoEstado === "aprobado" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/catalogo-maestro");
}

export async function vincularProductoASku(formData: FormData) {
  await requireModuloEscritura("catalogo-maestro");
  const productoId = formData.get("producto_id") as string;
  const skuMaestroId = (formData.get("sku_maestro_id") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("productos")
    .update({ sku_maestro_id: skuMaestroId })
    .eq("id", productoId);

  if (error) throw new Error(error.message);
  revalidatePath("/productos");
}
