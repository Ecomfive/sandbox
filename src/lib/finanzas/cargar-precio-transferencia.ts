// Lectura del precio de transferencia (migración 0952): la política, las reglas por producto o categoría, lo entregado por
// tienda y producto en los meses pedidos, los tipos de costo de ventas y las categorías y productos con costo. Solo lectura;
// los permisos los decide quien llama. Sin la migración, `{ error }`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerPoliticaTP, leerVentaTP, type PoliticaTP, type ReglaTP, type VentaTP } from "./precio-transferencia";

export const SIN_MIGRACION_TP = "Falta correr la migración 0952 (precio de transferencia) en Supabase.";

export interface DatosTP {
  politica: PoliticaTP;
  reglas: (ReglaTP & { id: string })[];
  ventas: VentaTP[];
}

export interface CatalogoTP {
  tiposCosto: string[];
  categorias: string[];
  productos: string[];
}

/** Política, reglas y lo entregado de `desde` a `hasta` (meses AAAA-MM-01). */
export async function cargarPrecioTransferencia(supabase: SupabaseClient, desde: string, hasta: string): Promise<DatosTP | { error: string }> {
  const [cfg, reglas, ventas] = await Promise.all([
    supabase.from("fin_config").select("valor").eq("clave", "precio_transferencia").maybeSingle(),
    supabase.from("fin_precio_transferencia_reglas").select("id, alcance, clave, margen_pct").order("alcance").order("clave"),
    supabase.rpc("fin_tp_unidades", { p_desde: desde, p_hasta: hasta }),
  ]);
  if (reglas.error || ventas.error) {
    console.error("precio de transferencia:", reglas.error?.message ?? ventas.error?.message);
    return { error: SIN_MIGRACION_TP };
  }
  return {
    politica: leerPoliticaTP(cfg.data?.valor),
    reglas: (reglas.data ?? []).map((r) => ({ id: String(r.id), alcance: r.alcance as ReglaTP["alcance"], clave: String(r.clave), margenPct: Number(r.margen_pct) })),
    ventas: ((ventas.data ?? []) as Record<string, unknown>[]).map(leerVentaTP),
  };
}

/** Lo que se ofrece al configurar: tipos de costo de ventas del libro, categorías y productos con costo. */
export async function cargarCatalogoTP(supabase: SupabaseClient): Promise<CatalogoTP> {
  const [tipos, costos] = await Promise.all([
    supabase.from("fin_tipos").select("nombre, orden").eq("seccion", "costo_ventas").order("orden"),
    supabase.from("fin_costo_vigente").select("producto_clave, linea").order("producto_clave").limit(5000),
  ]);
  const filas = (costos.data ?? []) as { producto_clave: string; linea: string | null }[];
  return {
    tiposCosto: (tipos.data ?? []).map((t) => String(t.nombre)),
    categorias: [...new Set(filas.map((f) => (f.linea ?? "").trim()).filter(Boolean))].sort(),
    productos: [...new Set(filas.map((f) => f.producto_clave).filter(Boolean))],
  };
}
