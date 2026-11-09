"use server";

// Descarga de un archivo de respaldo (mejora 100): solo quien puede modificar Usuarios y roles; la ruta se valida contra
// la lista fija de tablas y carpetas con fecha, y el enlace firmado dura un minuto.

import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { BUCKET_RESPALDOS, rutaValida } from "@/lib/finanzas/respaldo";
import { createServiceClient } from "@/lib/supabase/server";

export async function enlaceRespaldo(ruta: unknown): Promise<{ error?: string; url?: string }> {
  try {
    await requireModuloEscritura("usuarios");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  if (!rutaValida(ruta)) return { error: "Archivo inválido." };
  const { data, error } = await createServiceClient().storage.from(BUCKET_RESPALDOS).createSignedUrl(ruta as string, 60, { download: true });
  if (error || !data) return { error: "No se encontró el archivo." };
  await registrarAuditoria({ accion: "descargar_respaldo", entidad: "fin_respaldos", detalle: String(ruta) });
  return { url: data.signedUrl };
}
