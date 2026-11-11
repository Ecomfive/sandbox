// Lo que comparten las pestañas de unidad económica (Productos, Pedidos, Zonas y repartidores, Marketing, Equilibrio):
// los filtros de Rentabilidad (período, entidad, tienda), el rango que se manda a Postgres y los supuestos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarSupuestosUE, type RangoUE } from "@/lib/finanzas/cargar-unidad-economica";
import type { SupuestosUE } from "@/lib/finanzas/unidad-economica";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { cargarDatosPagina, type DatosPagina } from "../datos";

export interface ContextoUE {
  datos: DatosPagina;
  rango: RangoUE;
  supuestos: SupuestosUE;
  recordar: Awaited<ReturnType<typeof paramsConTienda>>["recordar"];
  /** La tienda elegida o «Todas las tiendas», el período y la moneda. */
  contexto: string;
  datosHasta: string | null;
}

export async function cargarContextoUE(
  supabase: SupabaseClient,
  searchParams: { [k: string]: string | string[] | undefined },
): Promise<ContextoUE | { error: string }> {
  // Sin `?tienda=` arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, searchParams, "tienda");
  const [datos, sup] = await Promise.all([cargarDatosPagina(supabase, selTienda.params), cargarSupuestosUE(supabase)]);
  if ("error" in datos) return datos;
  const { periodo, tienda, vista } = datos;
  // Con tiendas limitadas (mejora 99), «todas» son solo las suyas: las funciones de Postgres nunca reciben null.
  const unidades = tienda ? [tienda.id] : vista.entidad || datos.limitado ? datos.unidades.map((u) => u.id) : null;
  const meses = periodo.meses;
  return {
    datos,
    rango: { desde: meses[0] ?? datos.mesEnCurso, hasta: meses[meses.length - 1] ?? datos.mesEnCurso, unidades },
    supuestos: sup.supuestos,
    recordar: selTienda.recordar,
    contexto: [vista.entidad?.razon_social, tienda?.nombre ?? "Todas las tiendas", "USD"].filter(Boolean).join(" · "),
    datosHasta: datos.conDatos.filter((m) => m <= datos.mesEnCurso).at(-1) ?? null,
  };
}
