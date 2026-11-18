"use server";

// Descarga de un archivo de respaldo (mejora 100): solo quien puede modificar Usuarios y roles; la ruta se valida contra
// la lista fija de tablas y carpetas con fecha, y el enlace firmado dura un minuto.

import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { BUCKET_RESPALDOS, esCarpetaRespaldo, rutaValida } from "@/lib/finanzas/respaldo";
import { verificarRespaldo } from "@/lib/finanzas/respaldar-finanzas";
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

/** Comprueba que el respaldo se pueda restaurar (mejora 30): lee cada archivo y cuenta sus filas. */
export async function verificarRespaldoAhora(carpeta: unknown): Promise<{ error: string } | { ok: boolean; problemas: number; faltan: number }> {
  try {
    await requireModuloEscritura("usuarios");
    if (!esCarpetaRespaldo(carpeta)) return { error: "Respaldo inválido." };
    const v = await verificarRespaldo(createServiceClient(), carpeta, Date.now() + 50_000);
    if ("error" in v) return { error: /verificacion/.test(v.error) ? "Falta correr la migración 0982 en Supabase." : v.error };
    const problemas = v.tablas.filter((t) => t.estado !== "ok").length;
    await registrarAuditoria({ accion: "verificar_respaldo", entidad: "fin_respaldos", detalle: `${carpeta}: ${v.ok ? "se puede restaurar" : `${problemas} tablas con problemas, ${v.faltan.length} sin verificar`}` });
    revalidatePath("/panel-financiero/respaldos");
    return { ok: v.ok, problemas, faltan: v.faltan.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo verificar." };
  }
}
