// Comprobantes del libro en el servidor (no son acciones: no se pueden llamar desde el navegador). Los usan
// `libro-movimientos/comprobantes-actions.ts` y `factura-actions.ts`, que comprueban los permisos antes.

import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";

export const BUCKET_COMPROBANTES = "fin-comprobantes";
const MAX_BYTES = 15 * 1024 * 1024;
const FALTA = "Falta correr la migración 0925 en Supabase.";

/** Imagen (JPG, PNG, WebP, GIF) o PDF, por su contenido. */
export function tipoComprobante(bytes: Uint8Array): { tipo: string; extension: string } | null {
  const img = detectarImagen(bytes.slice(0, 64));
  if (img) return { tipo: img.tipo, extension: img.extension };
  if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return { tipo: "application/pdf", extension: "pdf" };
  return null;
}

/** Revisa el contenido, corrige su tipo y deja la fila. Usado también al crear un movimiento desde una factura. */
export async function registrarArchivo(movimientoId: string, ruta: string, nombre: string, usuarioId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  const storage = supabase.storage.from(BUCKET_COMPROBANTES);
  const borrar = async (error: string) => {
    await storage.remove([ruta]);
    return { error };
  };
  const { data, error } = await storage.download(ruta);
  if (error || !data) return { error: "No se encontró el archivo. Vuelve a subirlo." };
  if (data.size > MAX_BYTES) return borrar("El archivo pesa más de 15 MB.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const tipo = tipoComprobante(bytes);
  if (!tipo) return borrar("Se aceptan imágenes (JPG, PNG, WebP, GIF) o PDF; se revisa el contenido, no el nombre.");
  if ((data.type || "").split(";")[0] !== tipo.tipo) {
    const { error: e } = await storage.update(ruta, bytes, { contentType: tipo.tipo, upsert: true });
    if (e) return borrar("No se pudo guardar el archivo.");
  }
  const { error: e2 } = await supabase.from("fin_movimiento_adjuntos").insert({
    movimiento_id: movimientoId,
    ruta,
    nombre: String(nombre ?? "").trim().slice(0, 120) || `comprobante.${tipo.extension}`,
    tipo: tipo.tipo,
    tamano: data.size,
    creado_por: usuarioId,
  });
  if (e2) return borrar(e2.code === "42P01" ? FALTA : e2.message);
  return {};
}

