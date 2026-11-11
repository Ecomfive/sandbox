// La demanda del Plan de compras (mejora 15). Con el pronóstico de Planificación (pedidos por tienda, `pronostico.ts`,
// leído con `cargarPronosticoPedidos`) y la mezcla de productos de cada tienda en 90 días (`fin_plan_mezcla_productos`,
// migración 0954) arma unidades por producto y mes (`demandaPorPronostico`); lo que el pronóstico no cubre (Dropi, tiendas
// sin pronóstico) y todo, si falta la 0167 o la 0158, sale del ritmo de venta de 90 días con su tendencia de 30
// (`demandaPorRitmo`, las mismas ventas por producto que el Punto de reorden: `fin_inventario_vendido`, Panamá). La nota
// de la demanda dice qué fuente se usó. Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PAIS_FINANZAS } from "./cargar-inventario";
import { cargarPronosticoPedidos } from "./cargar-planificacion";
import { demandaPorPronostico, demandaPorRitmo, type DemandaProyectada, type VentasProducto } from "./plan-compras";

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function cargarDemandaProyectada(supabase: SupabaseClient, meses: string[], hoy: string, pais: string = PAIS_FINANZAS): Promise<DemandaProyectada | { error: string }> {
  const [v90, v30, mezcla, pronostico] = await Promise.all([
    supabase.rpc("fin_inventario_vendido", { p_dias: 90, p_pais: pais }),
    supabase.rpc("fin_inventario_vendido", { p_dias: 30, p_pais: pais }),
    supabase.rpc("fin_plan_mezcla_productos", { p_dias: 90 }),
    cargarPronosticoPedidos(supabase).catch(() => null),
  ]);
  if (v90.error) return { error: "Falta correr la migración 0921 (inventario valorizado) en Supabase." };
  const ventas = new Map<string, VentasProducto>();
  for (const f of (v90.data ?? []) as Record<string, unknown>[]) ventas.set(String(f.sku_maestro_id), { v90: num(f.unidades), v30: 0 });
  for (const f of (v30.error ? [] : ((v30.data ?? []) as Record<string, unknown>[]))) {
    const v = ventas.get(String(f.sku_maestro_id));
    if (v) v.v30 = num(f.unidades);
  }
  if (mezcla.error || !pronostico) {
    const r = demandaPorRitmo(ventas, meses, hoy);
    const falta = mezcla.error ? "falta la migración 0954" : "sin pronóstico de Planificación (migración 0945)";
    return { ...r, nota: `${r.nota} · ${falta}` };
  }
  const filas = (mezcla.data ?? []) as Record<string, unknown>[];
  const pedidosVentana = new Map<string, number>();
  for (const f of filas) pedidosVentana.set(String(f.unidad_id), num(f.pedidos));
  return demandaPorPronostico(
    {
      pedidos: pronostico.pedidos,
      mezcla: filas.map((f) => ({ unidadId: String(f.unidad_id), skuId: String(f.sku_maestro_id), unidades: num(f.unidades) })),
      pedidosVentana,
      ventas,
    },
    meses,
    hoy,
  );
}
