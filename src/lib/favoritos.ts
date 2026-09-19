import type { SupabaseClient } from "@supabase/supabase-js";

/** Hrefs que el usuario marcó como acceso rápido en el menú. */
export async function obtenerFavoritos(supabase: SupabaseClient, usuarioId: string): Promise<string[]> {
  const { data } = await supabase.from("favoritos_nav").select("href").eq("usuario_id", usuarioId);
  return (data ?? []).map((f) => f.href);
}
