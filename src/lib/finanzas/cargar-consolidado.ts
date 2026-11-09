// Lee lo que muestra «Tiendas y proveeduría»: los meses de cada lado y lo que falta cobrar. Sin las migraciones 0938 / 0962
// cada lado queda vacío y la pantalla lo dice. Los permisos los decide quien llama.
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { consolidarMeses, porCobrarConsolidado, type FilaConsolidada, type MesProveeduria, type MesTienda, type PorCobrar } from "./consolidado-canales";

export interface Consolidado {
  meses: FilaConsolidada[];
  porCobrar: PorCobrar;
  /** Qué lado no se pudo leer (falta su migración). */
  faltan: ("tiendas" | "proveeduria")[];
  actualizado: string | null;
}

export async function cargarConsolidado(supabase: SupabaseClient): Promise<{ error: string } | Consolidado> {
  const faltan: Consolidado["faltan"] = [];
  // Las tiendas de clientes de fulfillment (Clicksi) no son ventas nuestras: no se suman (migración 0965; sin ella, ninguna).
  const ff = await supabase.from("fin_unidades").select("id").eq("cliente_fulfillment", true);
  const deFulfillment = new Set((ff.error ? [] : ff.data ?? []).map((u) => u.id as string));
  const t = await traerTodasConError<MesTienda & { actualizado_en: string; unidad_id: string }>((d, h) =>
    supabase.from("fin_tiendas_mensual").select("periodo, unidad_id, ordenes, entregadas, canceladas, devueltas, ventas_entregadas, cod_esperado, cod_cobrado, cod_remitido, actualizado_en").order("periodo").range(d, h),
  );
  if (t.error) faltan.push("tiendas");
  const p = await traerTodasConError<MesProveeduria & { actualizado_en: string }>((d, h) =>
    supabase.from("fin_dropi_mensual").select("periodo, moneda, pedidos, entregados, ventas_entregadas, ganancias, retiros, actualizado_en").order("periodo").range(d, h),
  );
  if (p.error) faltan.push("proveeduria");
  const tf = (t.data ?? []).filter((f) => !deFulfillment.has(f.unidad_id));
  const pf = p.data ?? [];

  const docs = await supabase.from("fin_cartera").select("id, origen, monto, estado_manual").eq("clase", "cobrar").in("origen", ["tiendas", "dropi"]);
  if (docs.error) return { error: docs.error.message };
  const vivos = (docs.data ?? []).filter((d) => !d.estado_manual);
  const ids = vivos.map((d) => d.id as string);
  const abonado = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const a = await supabase.from("fin_cartera_abonos").select("documento_id, monto").in("documento_id", ids.slice(i, i + 100));
    if (a.error) return { error: a.error.message };
    for (const x of a.data ?? []) abonado.set(x.documento_id as string, (abonado.get(x.documento_id as string) ?? 0) + Number(x.monto));
  }
  const porCobrar = porCobrarConsolidado(vivos.map((d) => ({ origen: d.origen as string, monto: d.monto as number, abonado: abonado.get(d.id as string) ?? 0 })));
  const actualizado = [...tf, ...pf].map((f) => f.actualizado_en).sort().pop() ?? null;
  return { meses: consolidarMeses(tf, pf), porCobrar, faltan, actualizado };
}
