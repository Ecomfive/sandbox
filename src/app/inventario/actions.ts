"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { parseExtracto } from "@/lib/extractos/parse";
import { mapearMovimientosInventario, type MapeoColumnasInventario } from "@/lib/inventario/parse";

export interface ImportarInventarioState {
  status: "idle" | "success" | "error";
  mensaje?: string;
  filasImportadas?: number;
}

export async function importarInventario(
  _prevState: ImportarInventarioState,
  formData: FormData
): Promise<ImportarInventarioState> {
  const archivo = formData.get("archivo") as File | null;
  const paisId = formData.get("pais_id") as string | null;
  const mapeoRaw = formData.get("mapeo") as string | null;
  const tipoFijo = formData.get("tipo_fijo") as "entrada" | "salida" | "" | null;

  if (!archivo || archivo.size === 0) return { status: "error", mensaje: "Selecciona un archivo." };
  if (!paisId) return { status: "error", mensaje: "Selecciona un país." };
  if (!mapeoRaw) return { status: "error", mensaje: "Falta el mapeo de columnas." };

  const mapeo = JSON.parse(mapeoRaw) as MapeoColumnasInventario;
  const fechaCarga = new Date().toISOString().slice(0, 10);

  let movimientos;
  try {
    const { filas } = parseExtracto(await archivo.arrayBuffer());
    movimientos = mapearMovimientosInventario(filas, mapeo, tipoFijo || undefined);
  } catch (error) {
    return {
      status: "error",
      mensaje: error instanceof Error ? error.message : "No se pudo leer el archivo.",
    };
  }

  if (movimientos.length === 0) {
    return { status: "error", mensaje: "No se encontraron movimientos válidos en el archivo." };
  }

  const supabase = createServiceClient();

  const skusUnicos = Array.from(new Set(movimientos.map((m) => m.sku)));
  const { data: existentes } = await supabase
    .from("productos")
    .select("id, sku")
    .eq("pais_id", paisId)
    .in("sku", skusUnicos);

  const idPorSku = new Map((existentes ?? []).map((p) => [p.sku, p.id]));

  const skusFaltantes = skusUnicos.filter((sku) => !idPorSku.has(sku));
  if (skusFaltantes.length > 0) {
    const nombrePorSku = new Map(movimientos.map((m) => [m.sku, m.nombre]));
    const { data: creados, error: errCrear } = await supabase
      .from("productos")
      .insert(
        skusFaltantes.map((sku) => ({
          pais_id: paisId,
          sku,
          nombre: nombrePorSku.get(sku) || sku,
        }))
      )
      .select("id, sku");
    if (errCrear) {
      return { status: "error", mensaje: `Error creando productos nuevos: ${errCrear.message}` };
    }
    for (const p of creados ?? []) idPorSku.set(p.sku, p.id);
  }

  const { error: errMovimientos } = await supabase.from("movimientos_inventario").insert(
    movimientos.map((m) => ({
      pais_id: paisId,
      producto_id: idPorSku.get(m.sku),
      tipo: m.tipo,
      cantidad: m.cantidad,
      fuente: "pistoleo",
      referencia: m.referencia,
      fecha: m.fecha ?? fechaCarga,
    }))
  );
  if (errMovimientos) {
    return { status: "error", mensaje: `Error guardando movimientos: ${errMovimientos.message}` };
  }

  revalidatePath("/inventario");
  revalidatePath("/alertas");
  return { status: "success", filasImportadas: movimientos.length };
}
