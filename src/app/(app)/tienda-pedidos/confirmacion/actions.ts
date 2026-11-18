"use server";

import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { etapaConfirmacion } from "@/lib/tienda/confirmacion";
import { periodoElegido, type PedidoFila } from "@/lib/tienda/datos";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { diaPanama } from "@/lib/tienda/resumen";

/** Lo que identifica la vista de Confirmación: la tienda y el periodo de la dirección (los mismos parámetros que lee la página). */
export interface ConsultaConfirmacion {
  tienda: string | null;
  periodo: string | null;
  desde: string | null;
  hasta: string | null;
}

/**
 * Los confirmados o los cancelados del periodo, para la lista de Confirmación al pulsar su tarjeta (18 nov 2026, velocidad: antes la página mandaba
 * todos los pedidos del periodo —unos 4.000 en 30 días— aunque de entrada se ve la cola sin confirmar). Mismas tiendas y periodo que la página, con
 * los permisos de quien pregunta.
 */
export async function pedidosDeEtapa(consulta: ConsultaConfirmacion, etapa: "confirmado" | "cancelado"): Promise<{ pedidos: PedidoFila[] } | { error: string }> {
  await requireModulo("tienda-confirmacion");
  if (etapa !== "confirmado" && etapa !== "cancelado") return { error: "Lista desconocida." };
  const texto = (x: unknown) => (typeof x === "string" && x ? x : undefined);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, tienda, faltaMigracion } = await tiendasDeLaPersona(supabase, pais.id, texto(consulta?.tienda));
  if (faltaMigracion || !tiendas.length) return { pedidos: [] };
  const eleccion = periodoElegido({ periodo: texto(consulta?.periodo), desde: texto(consulta?.desde), hasta: texto(consulta?.hasta) });
  const { pedidos, periodo } = await pedidosDeTiendas(supabase, tienda ? [tienda] : tiendas, pais.codigo, eleccion);
  return {
    pedidos: pedidos.filter((p) => diaPanama(p.creado) >= periodo.desde && diaPanama(p.creado) <= periodo.hasta && etapaConfirmacion(p) === etapa),
  };
}
