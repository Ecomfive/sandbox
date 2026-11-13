"use server";

// El Pareto de publicaciones en el tablero de Gestión de IDs Dropi (12 nov 2026, pedido de Hernán: el 20 % de las publicaciones que trae el 80 % de las guías).
// Las guías de cada ID de producto de Dropi, mes a mes (12 meses) y de los últimos 30 días, salen de `dropi_guias_por_producto` (migración 0281): pedidos de
// Dropi sin cancelados, de todos los dropshippers. Se piden al abrir la página, aparte, para que la lista de publicaciones no espere; la tarjeta las junta por
// publicación (src/lib/publicaciones/pareto-publicaciones.ts).

import { ultimosMeses } from "@/lib/crm/pareto";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { guiasPorIdDeFilas } from "@/lib/publicaciones/pareto-publicaciones";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { guardado } from "../crm-dropshippers/direccion/guardado";

const MESES_PARETO_PUBLICACIONES = 12;

export type GuiasDropi =
  | {
      /** Primer día de cada uno de los últimos 12 meses (ISO), del más viejo al actual (en curso). */
      meses: string[];
      /** Por ID de producto de Dropi, sus guías en el orden de `meses`. */
      porMes: Record<string, number[]>;
      /** Por ID de producto de Dropi, sus guías de los últimos 30 días (solo los que tuvieron alguna). */
      dias30: Record<string, number>;
      nombrePais: string;
    }
  | { error: string };

const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Las guías de cada ID de Dropi del país de la barra (12 meses y 30 días), guardadas un minuto: abrir y cerrar la página no las vuelve a contar. */
export async function cargarGuiasDropi(): Promise<GuiasDropi> {
  await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const hoy = hoyPanama();
  return guardado(`pareto-publicaciones:${pais.id}:${hoy}`, async (): Promise<GuiasDropi> => {
    const r = await traerTodasConError<{ producto_id: number; mes: string; pedidos: number; pedidos_30: number }>((d, h) =>
      supabase.rpc("dropi_guias_por_producto", { p_pais: pais.id, p_meses: MESES_PARETO_PUBLICACIONES }).order("producto_id").order("mes").range(d, h),
    );
    if (r.error) return { error: "Falta correr la migración 0281 (guías por publicación) en la base." };
    const meses = ultimosMeses(hoy, MESES_PARETO_PUBLICACIONES);
    return { meses, ...guiasPorIdDeFilas(r.data ?? [], meses), nombrePais: pais.nombre };
  });
}
