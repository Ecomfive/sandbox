import type { SupabaseClient } from "@supabase/supabase-js";

/** Diccionario de patrones bancarios: qué plataforma corresponde a un texto de descripción
 * de extracto, aprendido de asignaciones manuales anteriores (ver `asignarPlataforma`). */

export interface PatronBancario {
  fragmento: string;
  plataforma_id: string;
}

export async function obtenerPatrones(supabase: SupabaseClient, paisId: string): Promise<PatronBancario[]> {
  const { data } = await supabase
    .from("patrones_bancarios")
    .select("fragmento, plataforma_id")
    .eq("pais_id", paisId);
  return data ?? [];
}

/** Si la descripción contiene alguno de los fragmentos guardados, sugiere esa plataforma. */
export function sugerirPlataforma(descripcion: string | null, patrones: PatronBancario[]): string | null {
  if (!descripcion) return null;
  const texto = descripcion.toLowerCase();
  const match = patrones.find((p) => texto.includes(p.fragmento.toLowerCase()));
  return match?.plataforma_id ?? null;
}

/** Se llama cada vez que alguien asigna a mano una plataforma a un movimiento: recuerda el
 * texto completo de esa descripción para reconocer movimientos iguales o parecidos después. */
export async function guardarPatron(
  supabase: SupabaseClient,
  paisId: string,
  descripcion: string,
  plataformaId: string
) {
  const fragmento = descripcion.trim();
  if (!fragmento) return;
  await supabase
    .from("patrones_bancarios")
    .upsert({ pais_id: paisId, fragmento, plataforma_id: plataformaId }, { onConflict: "pais_id,fragmento" });
}
