// Lectura del inventario contable (mejoras 71, 73, 74 y 78): bodegas en consignación, inventario en plataformas al
// costo, lo ya provisionado por obsoleto, el valor por país y la foto del cierre del balance. Solo lectura; los permisos
// los decide quien llama. Cada parte que falla queda vacía y lo demás se ve igual.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerStockPlataformas } from "@/app/(app)/inventario/datos-plataformas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { CLAVE_CONSIGNACION, leerConsignacion, valorizarPlataformas, type PlataformasValorizadas } from "./inventario-contable";

export interface DatosInventarioContable {
  consignacion: string[];
  plataformas: PlataformasValorizadas | null;
  /** Lo ya asentado como provisión en meses anteriores al de `mes`. */
  provisionAnterior: number;
  /** La provisión ya asentada este mes (null si no hay). */
  provisionMes: number | null;
  /** Valor del inventario de hoy por país (código ISO). */
  porPais: { pais: string; valor: number }[];
  /** La foto del inventario al último cierre (la que usa el balance), si la hay. */
  fotoCierre: { periodo: string; valor: number } | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function cargarInventarioContable(supabase: SupabaseClient, pais: string, mes: string, costosWms: Map<string, number>): Promise<DatosInventarioContable> {
  const [config, paisFila, vigentes, provisiones, valores, foto] = await Promise.all([
    supabase.from("fin_config").select("valor").eq("clave", CLAVE_CONSIGNACION).maybeSingle(),
    supabase.from("paises").select("id").eq("codigo", pais).maybeSingle(),
    traerTodasConError<{ sku_maestro_id: string | null; costo_vigente: number | string | null }>((d, h) =>
      supabase.from("fin_costo_vigente").select("sku_maestro_id, costo_vigente").not("sku_maestro_id", "is", null).order("producto_clave").range(d, h),
    ),
    supabase.from("fin_movimientos").select("periodo, monto, origen_clave").like("origen_clave", "provision-obsoleto:%").limit(500),
    traerTodasConError<{ pais: string; valor: number | string }>((d, h) => supabase.from("fin_inventario_valorizado").select("pais, valor").order("sku_maestro_id").order("bodega_id").order("lote_id").range(d, h)),
    supabase.from("fin_inventario_cortes").select("periodo, valor").lt("periodo", mes).order("periodo", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const costo = new Map<string, number>();
  for (const v of vigentes.error ? [] : (vigentes.data ?? [])) if (v.sku_maestro_id && v.costo_vigente !== null) costo.set(v.sku_maestro_id, num(v.costo_vigente));
  for (const [k, v] of costosWms) costo.set(k, v);
  let plataformas: PlataformasValorizadas | null = null;
  if (paisFila.data?.id) {
    const st = await leerStockPlataformas(supabase, paisFila.data.id as string).catch(() => null);
    if (st && st.porProducto.size) {
      plataformas = valorizarPlataformas(new Map([...st.porProducto].map(([k, s]) => [k, { dropi: s.dropi, drop: s.drop, effi: s.effi, dunamixfy: s.dunamixfy }])), costo);
    }
  }
  const prov = provisiones.error ? [] : (provisiones.data ?? []);
  const delMes = prov.filter((p) => String(p.periodo).slice(0, 7) === mes.slice(0, 7));
  const porPais = new Map<string, number>();
  for (const v of valores.error ? [] : (valores.data ?? [])) porPais.set(v.pais, (porPais.get(v.pais) ?? 0) + num(v.valor));
  return {
    consignacion: config.error ? [] : leerConsignacion(config.data?.valor),
    plataformas,
    provisionAnterior: Math.round(prov.filter((p) => String(p.periodo).slice(0, 7) < mes.slice(0, 7)).reduce((a, p) => a + num(p.monto), 0) * 100) / 100,
    provisionMes: delMes.length ? Math.round(delMes.reduce((a, p) => a + num(p.monto), 0) * 100) / 100 : null,
    porPais: [...porPais].map(([p, valor]) => ({ pais: p, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
    fotoCierre: foto.error || !foto.data ? null : { periodo: String(foto.data.periodo).slice(0, 10), valor: num(foto.data.valor) },
  };
}
