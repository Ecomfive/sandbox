// Qué cifras de una página tienen hilo de comentarios (para el ícono discreto de la celda). Sin la migración 0937 no hay
// ninguno y la página carga igual. Los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { contarHilos, type PaginaComentarios } from "./comentarios";

export async function cargarHilos(supabase: SupabaseClient, pagina: PaginaComentarios, periodo: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("fin_comentarios").select("clave").eq("pagina", pagina).eq("periodo", periodo).limit(2000);
  return error ? {} : contarHilos((data ?? []) as { clave: string }[]);
}
