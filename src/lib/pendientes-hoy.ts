import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";
import { creditosPorAcabarse } from "@/lib/ia/consumo";
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
  /** Competidores que entraron a Dropi del país (alertas de Análisis de competencia sin marcar como vistas). */
  competidoresNuevos: number;
  /** Recomendaciones aceptadas en Gestión de IDs Dropi que pasaron su plazo sin hacerse (migración 0128). */
  tareasAtrasadas: number;
  /** Proveedores de IA (OpenAI, Gemini) cuyo crédito estimado bajó del monto de aviso o se agotó (migración 0134). */
  creditosIA: number;
  /** Productos que se quedaron sin stock en Dropi y Compras todavía no revisa (migración 0167). */
  sinStockPorRevisar: number;
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
 * no se pudieron vincular a ningún retiro local, los lotes vencidos o por vencer y los competidores nuevos en Dropi.
 */
async function calcularPendientesHoy(supabase: SupabaseClient, paisId: string): Promise<PendientesHoy> {
  const [
    { count: alertasInventario },
    { data: plataformasPais },
    { data: saldos },
    { count: pedidosConNovedad },
    { count: retirosDropiSinVincular },
    lotes,
    { count: competidoresNuevos },
    { count: tareasAtrasadas },
    creditosIA,
    { count: sinStockPorRevisar },
    { count: tareasManualesAtrasadas },
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
    // Sin la migración 0108 la consulta falla y cuenta cero: el aviso no rompe la página.
    supabase.from("competencia_alertas").select("*", { count: "exact", head: true }).eq("pais_id", paisId).eq("tipo", "competidor_nuevo").eq("vista", false),
    // Sin la migración 0128 la consulta falla y cuenta cero.
    supabase
      .from("dropi_publicaciones_decisiones")
      .select("id, dropi_publicaciones!inner(pais_id)", { count: "exact", head: true })
      .eq("dropi_publicaciones.pais_id", paisId)
      .eq("decision", "aceptada")
      .is("hecha_en", null)
      .lt("plazo", new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" })),
    // Sin la migración 0134 no hay crédito registrado y cuenta cero.
    creditosPorAcabarse(supabase).catch(() => []),
    // Sin la migración 0167 la consulta falla y cuenta cero.
    supabase.from("compras_alertas_sin_stock").select("*", { count: "exact", head: true }).eq("pais_id", paisId).eq("estado", "abierta"),
    // Las tareas escritas a mano en Gestión de IDs Dropi que pasaron su fecha (migración 0175), sin las archivadas (0178); sin ella, cero.
    (async () => {
      const contar = (sinArchivadas: boolean) => {
        const q = supabase
          .from("dropi_publicaciones_tareas")
          .select("id, dropi_publicaciones!inner(pais_id)", { count: "exact", head: true })
          .eq("dropi_publicaciones.pais_id", paisId)
          .is("hecha_en", null)
          .lt("plazo", new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }));
        return sinArchivadas ? q.is("archivada_en", null) : q;
      };
      const r = await contar(true);
      return r.error ? contar(false) : r;
    })(),
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
    competidoresNuevos: competidoresNuevos ?? 0,
    tareasAtrasadas: (tareasAtrasadas ?? 0) + (tareasManualesAtrasadas ?? 0),
    creditosIA: creditosIA.length,
    sinStockPorRevisar: sinStockPorRevisar ?? 0,
  };
}

/**
 * Los pendientes de hoy de un país, guardados 45 segundos (rendimiento, 27 oct 2026): el layout los pide en **cada página** para los
 * avisos del menú y «Hoy» y «Avisos» los vuelven a pedir; son nueve consultas (una recorría todas las órdenes). Son del país, no de cada
 * persona (el menú se filtra después por sus módulos), así que se pueden compartir. Un aviso resuelto tarda hasta 45 s en bajar.
 */
const pendientesPorPais = conTtl(45_000, (paisId: string) => paisId, (paisId: string, supabase: SupabaseClient) => calcularPendientesHoy(supabase, paisId));
export const obtenerPendientesHoy = (supabase: SupabaseClient, paisId: string): Promise<PendientesHoy> => pendientesPorPais(paisId, supabase);
