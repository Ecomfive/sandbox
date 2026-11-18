import type { SupabaseClient } from "@supabase/supabase-js";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";

// Para acciones que reciben el id de una fila con `pais_id` desde el navegador: con países limitados, solo se toca una fila
// de un país de la persona (auditoría de seguridad, 18 nov 2026). `permitidos` null = todos.

/** Si la fila existe y es de un país que la persona ve. Sin países limitados, true sin leer nada. */
export async function filaDePaisPermitida(supabase: SupabaseClient, permitidos: string[] | null, tabla: string, id: string): Promise<boolean> {
  if (permitidos === null) return true;
  const { data } = await supabase.from(tabla).select("pais_id").eq("id", id).maybeSingle();
  return !!data && puedeVerPaisId(supabase, permitidos, (data as { pais_id: string | null }).pais_id);
}

/** De una lista de países (`id`, `codigo`), los ids de los que la persona ve; `null` = todos. Lógica pura. */
export function idsDePaisesVisibles(paises: { id: string; codigo: string }[], permitidos: string[] | null): string[] | null {
  if (permitidos === null) return null;
  return paises.filter((p) => puedeVerPais(permitidos, p.codigo)).map((p) => p.id);
}

/** Los ids de los países que la persona ve (`null` = todos), para filtrar una consulta o escritura de varias filas. */
export async function idsPaisesPermitidos(supabase: SupabaseClient, permitidos: string[] | null): Promise<string[] | null> {
  if (permitidos === null) return null;
  const { data } = await supabase.from("paises").select("id, codigo");
  return idsDePaisesVisibles((data ?? []) as { id: string; codigo: string }[], permitidos);
}

/** Deja solo las filas de un país visible (`visibles` de `idsPaisesPermitidos`; null = todas). Lógica pura. */
export function filasDePaisesVisibles<T extends { pais_id: string | null }>(filas: T[], visibles: string[] | null): T[] {
  if (visibles === null) return filas;
  return filas.filter((f) => f.pais_id !== null && visibles.includes(f.pais_id));
}
