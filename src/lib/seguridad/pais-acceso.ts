import type { SupabaseClient } from "@supabase/supabase-js";
import { puedeVerPais } from "@/lib/paises-permitidos";

/**
 * Si la persona puede tocar el país con ese id (`permitidos` null = todos). Para acciones que reciben un `pais_id` del
 * navegador: con países limitados, uno que no es suyo —o que no existe— se rechaza (auditoría de seguridad, 13 oct 2026).
 */
export async function puedeVerPaisId(supabase: SupabaseClient, permitidos: string[] | null, paisId: string | null | undefined): Promise<boolean> {
  if (permitidos === null) return true;
  if (!paisId) return false;
  const { data } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
  return !!data && puedeVerPais(permitidos, data.codigo as string);
}

/** Igual que `puedeVerPaisId`, para una bodega (`wms_bodegas.pais_id`). */
export async function puedeVerBodega(supabase: SupabaseClient, permitidos: string[] | null, bodegaId: string): Promise<boolean> {
  if (permitidos === null) return true;
  const { data } = await supabase.from("wms_bodegas").select("pais_id").eq("id", bodegaId).maybeSingle();
  return !!data && puedeVerPaisId(supabase, permitidos, data.pais_id as string);
}
