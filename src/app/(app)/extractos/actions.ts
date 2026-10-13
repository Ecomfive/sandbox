"use server";

import { esUuid, nombreArchivoSeguro } from "@/lib/seguridad/ruta-almacen";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { parseExtracto, mapearMovimientos, type MapeoColumnas } from "@/lib/extractos/parse";
import { requireModuloEscritura } from "@/lib/auth";
import { obtenerPatrones, sugerirPlataforma, guardarPatron } from "@/lib/extractos/patrones";

export interface ImportarExtractoState {
  status: "idle" | "success" | "error";
  mensaje?: string;
  filasImportadas?: number;
}

export async function importarExtracto(
  _prevState: ImportarExtractoState,
  formData: FormData
): Promise<ImportarExtractoState> {
  try {
    await requireModuloEscritura("extractos");
  } catch (error) {
    return { status: "error", mensaje: error instanceof Error ? error.message : "Sin permiso." };
  }
  const archivo = formData.get("archivo") as File | null;
  const paisId = formData.get("pais_id") as string | null;
  const mapeoRaw = formData.get("mapeo") as string | null;

  if (!archivo || archivo.size === 0) {
    return { status: "error", mensaje: "Selecciona un archivo." };
  }
  if (!esUuid(paisId)) {
    return { status: "error", mensaje: "Selecciona un país." };
  }
  if (!mapeoRaw) {
    return { status: "error", mensaje: "Falta el mapeo de columnas." };
  }

  let mapeo: MapeoColumnas;
  try {
    mapeo = JSON.parse(mapeoRaw) as MapeoColumnas;
  } catch {
    return { status: "error", mensaje: "El mapeo de columnas no es válido." };
  }
  const buffer = await archivo.arrayBuffer();

  let movimientos;
  try {
    const { filas } = parseExtracto(buffer);
    movimientos = mapearMovimientos(filas, mapeo);
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

  // El país es un UUID y el nombre se limpia: nada que mande el navegador puede sacar el archivo de su carpeta.
  const rutaArchivo = `${paisId}/${Date.now()}-${nombreArchivoSeguro(archivo.name)}`;
  const { error: errorStorage } = await supabase.storage
    .from("extractos-bancarios")
    .upload(rutaArchivo, buffer, {
      contentType: archivo.type || "application/octet-stream",
    });
  if (errorStorage) {
    return { status: "error", mensaje: `Error subiendo el archivo: ${errorStorage.message}` };
  }

  const { data: extracto, error: errorExtracto } = await supabase
    .from("extractos_bancarios")
    .insert({ pais_id: paisId, archivo_path: rutaArchivo })
    .select("id")
    .single();
  if (errorExtracto || !extracto) {
    return {
      status: "error",
      mensaje: `Error registrando el extracto: ${errorExtracto?.message}`,
    };
  }

  const patrones = await obtenerPatrones(supabase, paisId);
  const { error: errorMovimientos } = await supabase.from("movimientos_bancarios").insert(
    movimientos.map((m) => ({
      extracto_id: extracto.id,
      fecha: m.fecha,
      monto: m.monto,
      descripcion: m.descripcion,
      tipo: m.tipo,
      plataforma_id: sugerirPlataforma(m.descripcion, patrones),
    }))
  );
  if (errorMovimientos) {
    return {
      status: "error",
      mensaje: `Error guardando movimientos: ${errorMovimientos.message}`,
    };
  }

  revalidatePath("/extractos");
  return { status: "success", filasImportadas: movimientos.length };
}

export async function asignarPlataforma(movimientoId: string, plataformaId: string) {
  await requireModuloEscritura("extractos");
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("movimientos_bancarios")
    .update({ plataforma_id: plataformaId || null })
    .eq("id", movimientoId);
  if (error) {
    throw new Error(error.message);
  }

  // Recuerda esta asignación para reconocer movimientos con la misma descripción después.
  if (plataformaId) {
    const { data: movimiento } = await supabase
      .from("movimientos_bancarios")
      .select("descripcion, extractos_bancarios(pais_id)")
      .eq("id", movimientoId)
      .single();
    const paisId = (movimiento?.extractos_bancarios as unknown as { pais_id: string } | null)?.pais_id;
    if (movimiento?.descripcion && paisId) {
      await guardarPatron(supabase, paisId, movimiento.descripcion, plataformaId);
    }
  }
  revalidatePath("/extractos");
}
