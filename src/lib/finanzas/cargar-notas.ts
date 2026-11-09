// Lectura de las notas a los estados financieros de un mes (`fin_notas_mes`, migración 0929). Solo lectura.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function cargarNotaMes(supabase: SupabaseClient, periodo: string): Promise<{ texto: string; faltaMigracion: boolean }> {
  const r = await supabase.from("fin_notas_mes").select("texto").eq("periodo", periodo).maybeSingle();
  if (r.error) return { texto: "", faltaMigracion: true };
  return { texto: (r.data?.texto as string | undefined) ?? "", faltaMigracion: false };
}
