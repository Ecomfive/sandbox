// Confirmación con IA: qué tiendas puede ver cada persona. Quien tiene tiendas limitadas en Usuarios y roles (`perfiles.tiendas_permitidas`, que se guardan como unidades de Finanzas) ve y
// agrega solo lo de esas tiendas (los asesores de Oferfy, solo Oferfy); quien no tiene límite ve todas las del país. Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { cargarTiendas, type Tienda } from "@/lib/tienda/datos";
import { mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";

/** Las tiendas del país que la persona puede ver, y si tiene límite. */
export async function tiendasVisibles(supabase: SupabaseClient, paisId: string): Promise<{ tiendas: Tienda[]; limitado: boolean; faltaMigracion: boolean }> {
  const [{ tiendas, faltaMigracion }, permitidas] = await Promise.all([cargarTiendas(supabase, paisId), cargarTiendasPermitidas()]);
  if (permitidas === null) return { tiendas, limitado: false, faltaMigracion };
  if (!permitidas.length) return { tiendas: [], limitado: true, faltaMigracion };
  const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre").in("id", permitidas);
  const nombres = (unidades ?? []).map((u) => u.nombre as string);
  return { tiendas: tiendas.filter((t) => nombres.some((n) => mismaTiendaUnidad(t.nombre, n))), limitado: true, faltaMigracion };
}
