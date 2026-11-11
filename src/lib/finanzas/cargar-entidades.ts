// Lectura de entidades y tipos de cambio por mes (migración 0923). Sin la migración devuelve listas vacías y las páginas
// siguen como antes (todo junto, en dólares). Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entidad, TasaMes } from "./entidades";

/** Las entidades activas, en orden. [] sin la migración 0923. */
export async function cargarEntidades(supabase: SupabaseClient): Promise<Entidad[]> {
  const { data, error } = await supabase.from("fin_entidades").select("id, codigo, razon_social, moneda, orden").eq("activo", true).order("orden");
  if (error) return [];
  return (data ?? []).map((e) => ({
    id: e.id as string,
    codigo: e.codigo as string,
    razon_social: e.razon_social as string,
    moneda: e.moneda as string,
    orden: Number(e.orden ?? 0),
  }));
}

/** Los tipos de cambio por mes (todas las monedas, o las pedidas). [] sin la migración 0923. */
export async function cargarTasasMes(supabase: SupabaseClient, monedas?: string[]): Promise<TasaMes[]> {
  let q = supabase.from("fin_tipos_cambio_mes").select("moneda, periodo, promedio, cierre").order("periodo");
  if (monedas) q = q.in("moneda", monedas);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((t) => ({ moneda: t.moneda as string, periodo: String(t.periodo).slice(0, 10), promedio: Number(t.promedio), cierre: Number(t.cierre) }));
}

/** De cada unidad, su entidad. Vacío sin la migración 0923. */
export async function entidadDeUnidades(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("fin_unidades").select("id, entidad_id");
  if (error) return new Map();
  return new Map((data ?? []).filter((u) => u.entidad_id).map((u) => [u.id as string, u.entidad_id as string]));
}
