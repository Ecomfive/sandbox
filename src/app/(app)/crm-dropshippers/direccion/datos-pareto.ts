import type { SupabaseClient } from "@supabase/supabase-js";
import { guiasPorMes, ultimosMeses } from "@/lib/crm/pareto";
import { traerTodasConError } from "@/lib/supabase/paginar";

/** Los meses que se cargan siempre: el análisis de 3 y 6 meses sale de los últimos de estos 12. */
export const MESES_PARETO = 12;

/** Las guías de cada dropshipper mes a mes (serializable: va a los componentes de cliente). */
export interface DatosPareto {
  /** Primer día de cada uno de los últimos 12 meses (ISO), del más viejo al actual (en curso). */
  meses: string[];
  /** Por dropshipper, sus guías en el orden de `meses`; solo los que tuvieron alguna. */
  porMes: Record<string, number[]>;
}

export type CargaPareto = DatosPareto | { error: string };

/**
 * Las guías (pedidos de Dropi sin cancelados) de cada dropshipper con cuenta vinculada en los últimos 12 meses, mes a mes (`crm_pedidos_mensuales`, migración 0207).
 * De ahí salen el análisis de Pareto de la cartera, la posición de cada cliente y su historial. `hoy`: la fecha de Panamá (ISO). Sin la migración devuelve el error.
 */
export async function cargarPareto(supabase: SupabaseClient, paisId: string, hoy: string): Promise<CargaPareto> {
  const r = await traerTodasConError<{ dropshipper_id: string; mes: string; pedidos: number }>((d, h) =>
    supabase.rpc("crm_pedidos_mensuales", { p_pais: paisId, p_meses: MESES_PARETO }).order("dropshipper_id").order("mes").range(d, h),
  );
  if (r.error) return { error: "Falta correr la migración 0207 (Pareto de guías) en la base." };
  const meses = ultimosMeses(hoy, MESES_PARETO);
  const por = guiasPorMes(
    (r.data ?? []).map((f) => ({ dropshipperId: f.dropshipper_id, mes: f.mes, pedidos: Number(f.pedidos) })),
    meses,
  );
  return { meses, porMes: Object.fromEntries(por) };
}
