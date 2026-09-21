import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerPlataformaDropiId } from "@/lib/plataforma-dropi";

export interface PendientesHoy {
  alertasInventario: number;
  saldosSinRegistrar: number;
  pedidosConNovedad: number;
  retirosDropiSinVincular: number;
}

async function contarNovedades(supabase: SupabaseClient, paisId: string): Promise<{ count: number | null }> {
  const plataformaId = await obtenerPlataformaDropiId(supabase);
  if (!plataformaId) return { count: 0 };
  const { count } = await supabase
    .from("ordenes")
    .select("*", { count: "exact", head: true })
    .eq("pais_id", paisId)
    .eq("plataforma_id", plataformaId)
    .eq("estado", "NOVEDAD");
  return { count };
}

/**
 * Cruza en un solo lugar los pendientes que hoy viven cada uno en su propio
 * módulo: alertas de inventario abiertas, plataformas sin saldo de wallet
 * registrado, pedidos de Dropi con estado "Novedad" y retiros de Dropi que
 * no se pudieron vincular a ningún retiro local.
 */
export async function obtenerPendientesHoy(supabase: SupabaseClient, paisId: string): Promise<PendientesHoy> {
  const [
    { count: alertasInventario },
    { data: plataformasPais },
    { data: saldos },
    { count: pedidosConNovedad },
    { count: retirosDropiSinVincular },
  ] = await Promise.all([
    supabase
      .from("alertas_inventario_no_retornado")
      .select("*", { count: "exact", head: true })
      .eq("pais_id", paisId)
      .eq("estado", "abierta"),
    supabase.from("pais_plataformas").select("plataforma_id").eq("pais_id", paisId),
    supabase.from("saldos_wallet").select("plataforma_id").eq("pais_id", paisId),
    // El id de Dropi está guardado en memoria: el conteo de pedidos ya no espera una consulta más, va con las demás.
    contarNovedades(supabase, paisId),
    supabase.from("dropi_retiros_sin_vincular").select("*", { count: "exact", head: true }).eq("pais_id", paisId),
  ]);

  const plataformasConSaldo = new Set((saldos ?? []).map((s) => s.plataforma_id));
  const saldosSinRegistrar = (plataformasPais ?? []).filter(
    (p) => !plataformasConSaldo.has(p.plataforma_id)
  ).length;

  return {
    alertasInventario: alertasInventario ?? 0,
    saldosSinRegistrar,
    pedidosConNovedad: pedidosConNovedad ?? 0,
    retirosDropiSinVincular: retirosDropiSinVincular ?? 0,
  };
}
