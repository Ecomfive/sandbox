// Lectura del Plan de compras (mejora 15, migración 0948): el inventario valorizado, las compras de Panamá (lo que viene
// en camino y el plazo real de cada producto, con `armarReorden`), la demanda proyectada (`cargarDemandaProyectada`, el
// punto de enganche del pronóstico), el lote mínimo por producto y los ajustes. Sin la 0161 el plan se arma igual con el
// lote general y los ajustes predeterminados. Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarComprasCostos } from "./cargar-compras-costos";
import { cargarInventario, PAIS_FINANZAS } from "./cargar-inventario";
import { armarReorden, porPagarProveedores, presupuestoCompras } from "./compras-costos";
import { cargarDemandaProyectada } from "./demanda-plan";
import { resumirInventario } from "./inventario-valorizado";
import {
  armarPlan,
  CLAVE_PLAN_COMPRAS,
  leerConfigPlan,
  llegadasEnCamino,
  mesesPlan,
  type ConfigPlan,
  type DemandaProyectada,
  type EntradaPlan,
  type LoteProducto,
  type ResultadoPlan,
} from "./plan-compras";

export const SIN_MIGRACION_PLAN = "Falta correr la migración 0948 (plan de compras, riesgos) en Supabase.";

const num = (v: unknown) => Number(v ?? 0) || 0;

export interface DatosPlanCompras {
  plan: ResultadoPlan;
  config: ConfigPlan;
  demanda: DemandaProyectada;
  ajustes: { seguridadDias: number; coberturaDias: number };
  /** Lo comprometido por mes (saldos de compras abiertas y gastos de importación), para llevar el plan al presupuesto. */
  comprometido: Map<string, number>;
  /** Presupuesto de compras ya guardado por mes. */
  presupuestos: Map<string, number>;
  lotes: Map<string, LoteProducto>;
  productos: { skuId: string; codigo: string; producto: string }[];
  sinMigracion: boolean;
}

export async function cargarConfigPlan(supabase: SupabaseClient): Promise<ConfigPlan> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_PLAN_COMPRAS).maybeSingle();
  return leerConfigPlan(error ? null : data?.valor);
}

export async function cargarPlanCompras(supabase: SupabaseClient, hoy: string, pais: string = PAIS_FINANZAS): Promise<DatosPlanCompras | { error: string }> {
  const config = await cargarConfigPlan(supabase);
  const meses = mesesPlan(hoy, config.meses);
  const [inv, compras, demanda, lotesR] = await Promise.all([
    cargarInventario(supabase, pais),
    cargarComprasCostos(supabase, hoy, pais),
    cargarDemandaProyectada(supabase, meses, hoy, pais),
    supabase.from("fin_plan_compras_producto").select("sku_maestro_id, lote_minimo, multiplo, excluir"),
  ]);
  if ("error" in inv) return inv;
  if ("error" in compras) return compras;
  if ("error" in demanda) return demanda;
  const lotes = new Map<string, LoteProducto>();
  for (const l of lotesR.error ? [] : ((lotesR.data ?? []) as Record<string, unknown>[])) {
    lotes.set(String(l.sku_maestro_id), { loteMinimo: num(l.lote_minimo), multiplo: Math.max(num(l.multiplo), 1), excluir: l.excluir === true });
  }
  const r = resumirInventario(inv.filas, inv.vendido, hoy, inv.tasa);
  const reorden = armarReorden(compras.compras, compras.items, pais, hoy);
  const llegadas = llegadasEnCamino(compras.compras, compras.items, reorden.plazo, hoy);
  const porSku = new Map(r.porProducto.map((p) => [p.skuId, p]));
  const ids = [...new Set([...porSku.keys(), ...demanda.porProducto.keys()])];
  const skus = new Map<string, { codigo: string; nombre: string; tipo: string; clase: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, clase").in("id", ids.slice(i, i + 200));
    for (const s of data ?? []) skus.set(String(s.id), { codigo: String(s.codigo ?? ""), nombre: String(s.nombre ?? ""), tipo: String(s.tipo ?? ""), clase: String(s.clase ?? "") });
  }
  // Los mismos productos que el Punto de reorden: simples y activos (un combo no se compra; se compran sus componentes).
  const entradas: EntradaPlan[] = ids
    .filter((id) => {
      const s = skus.get(id);
      return s && s.tipo !== "combo" && s.clase === "fisico";
    })
    .map((id) => {
      const p = porSku.get(id);
      const s = skus.get(id)!;
      return {
        skuId: id,
        codigo: s.codigo,
        producto: s.nombre,
        stock: p?.unidades ?? 0,
        costoUnitario: p?.costoUnitario ?? compras.vigente.get(id) ?? null,
        plazo: reorden.plazo(id),
        llegadas: llegadas.get(id) ?? [],
        lote: lotes.get(id) ?? null,
      };
    });
  const ajustes = { seguridadDias: compras.ajustes.seguridadDias, coberturaDias: compras.ajustes.coberturaDias };
  const plan = armarPlan(entradas, demanda, ajustes, config, hoy);
  const porPagar = porPagarProveedores(compras.compras, compras.gastos, hoy);
  const comprometido = new Map(presupuestoCompras(meses, new Map(), porPagar, hoy).map((m) => [m.mes, m.comprometido]));
  return {
    plan,
    config,
    demanda,
    ajustes,
    comprometido,
    presupuestos: compras.presupuestos,
    lotes,
    productos: entradas.map((e) => ({ skuId: e.skuId, codigo: e.codigo, producto: e.producto })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    sinMigracion: !!lotesR.error,
  };
}
