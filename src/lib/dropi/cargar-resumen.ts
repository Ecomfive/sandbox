// La lectura de Pedidos Dropi › Resumen: los últimos 12 meses (hasta el mes en curso, hora de Panamá) de `dropi_resumen_mensual`
// (migración 0340). La usan la página y su Excel. Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerMeses, type MesDropi } from "./resumen-mensual";

export const MESES_RESUMEN = 12;
export const SIN_MIGRACION_RESUMEN_DROPI = "Falta correr la migración 0340 en Supabase (resumen mensual de Dropi).";

const mesDePanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }).slice(0, 7);

export async function cargarResumenDropi(supabase: SupabaseClient, paisId: string): Promise<{ meses: MesDropi[]; enCurso: string } | { error: string }> {
  const enCurso = `${mesDePanama()}-01`;
  const d = new Date(`${enCurso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (MESES_RESUMEN - 1));
  const desde = d.toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("dropi_resumen_mensual", { p_pais: paisId, p_desde: desde, p_hasta: enCurso });
  if (error) return { error: /dropi_resumen_mensual|function/i.test(error.message) ? SIN_MIGRACION_RESUMEN_DROPI : error.message };
  const meses = leerMeses((data ?? []) as Record<string, unknown>[]);
  // Los meses del principio sin nada (antes de que se leyera Dropi) no se muestran.
  const primero = meses.findIndex((m) => m.filas > 0 || m.pagos_ganancia > 0 || m.retiros > 0);
  return { meses: primero === -1 ? [] : meses.slice(primero), enCurso };
}
