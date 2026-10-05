import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerPlataformaDropiId } from "@/lib/plataforma-dropi";

export interface PendientesHoy {
  alertasInventario: number;
  saldosSinRegistrar: number;
  pedidosConNovedad: number;
  retirosDropiSinVincular: number;
  /** Lotes con unidades cuya fecha de vencimiento ya pasó (hay que darlos de baja). */
  lotesVencidos: number;
  /** Lotes con unidades que vencen dentro de los días de aviso de su producto. */
  lotesPorVencer: number;
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

/** Cuántos lotes del país están vencidos y cuántos por vencer. Si la función no responde, cuenta cero: el aviso no rompe la página. */
async function contarLotes(supabase: SupabaseClient, paisId: string): Promise<{ vencidos: number; porVencer: number }> {
  const { data, error } = await supabase.rpc("wms_vigilancia_vencimientos", { p_pais: paisId });
  if (error || !Array.isArray(data)) return { vencidos: 0, porVencer: 0 };
  const filas = data as { estado: string }[];
  return { vencidos: filas.filter((f) => f.estado === "vencido").length, porVencer: filas.filter((f) => f.estado === "por_vencer").length };
}

/**
 * Cruza en un solo lugar los pendientes que hoy viven cada uno en su propio
 * módulo: alertas de inventario abiertas, plataformas sin saldo de wallet
 * registrado, pedidos de Dropi con estado "Novedad" y retiros de Dropi que
 * no se pudieron vincular a ningún retiro local, y los lotes vencidos o por vencer.
 */
export async function obtenerPendientesHoy(supabase: SupabaseClient, paisId: string): Promise<PendientesHoy> {
  const [
    { count: alertasInventario },
    { data: plataformasPais },
    { data: saldos },
    { count: pedidosConNovedad },
    { count: retirosDropiSinVincular },
    lotes,
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
    contarLotes(supabase, paisId),
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
    lotesVencidos: lotes.vencidos,
    lotesPorVencer: lotes.porVencer,
  };
}
