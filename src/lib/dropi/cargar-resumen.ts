// La lectura de Pedidos Dropi › Resumen (migración 0340). Desde el 23 nov 2026 se ve un año a la vez: un mes con el anterior y la
// diferencia, o todo el año con su total (`elegirVista` / `armarVista` en resumen-mensual.ts). La usan la página y su Excel.
// Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarVista, elegirVista, leerMeses, mesAnterior, type ColumnaVista, type FilaResumen, type VistaElegida } from "./resumen-mensual";

export const SIN_MIGRACION_RESUMEN_DROPI = "Falta correr la migración 0340 en Supabase (resumen mensual de Dropi).";

const mesDePanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }).slice(0, 7);

export interface ResumenDropiVista {
  vista: VistaElegida;
  enCurso: string;
  columnas: ColumnaVista[];
  filas: FilaResumen[];
}

/** La vista pedida (`?anio=`, `?mes=`): null si el país todavía no tiene pedidos de Dropi guardados. */
export async function cargarResumenDropi(
  supabase: SupabaseClient,
  paisId: string,
  params: { anio?: unknown; mes?: unknown },
): Promise<ResumenDropiVista | null | { error: string }> {
  const enCurso = `${mesDePanama()}-01`;
  const { data: dropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").maybeSingle();
  if (!dropi) return null;
  // El primer mes con pedidos guardados (Panamá: marzo 2026): antes solo hay billetera, y un mes con 0 pedidos parecería sin ventas.
  const { data: primero, error: e1 } = await supabase.from("ordenes").select("fecha").eq("pais_id", paisId).eq("plataforma_id", dropi.id).order("fecha").limit(1).maybeSingle();
  if (e1) return { error: e1.message };
  if (!primero) return null;
  const vista = elegirVista(params, `${String(primero.fecha).slice(0, 7)}-01`, enCurso);
  // Lo que se lee: el año entero o el mes elegido con su anterior (que puede ser de otro año).
  const desde = vista.mes ? mesAnterior(vista.mes) : vista.mesesAnio[0];
  const hasta = vista.mes ?? vista.mesesAnio.at(-1)!;
  const { data, error } = await supabase.rpc("dropi_resumen_mensual", { p_pais: paisId, p_desde: desde, p_hasta: hasta });
  if (error) return { error: /dropi_resumen_mensual|function/i.test(error.message) ? SIN_MIGRACION_RESUMEN_DROPI : error.message };
  const meses = leerMeses((data ?? []) as Record<string, unknown>[]).filter((m) => m.filas > 0 || m.periodo === vista.mes);
  return { vista, enCurso, ...armarVista(meses, vista, enCurso) };
}
