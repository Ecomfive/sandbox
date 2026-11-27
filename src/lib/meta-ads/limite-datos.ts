// Anuncios Meta › de dónde sale el tope de cada producto: lo escrito a mano (`meta_topes`) y la entrega de sus pedidos (la del último análisis guardado). Solo lee.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveDeAnalisis } from "./analisis-tipos";
import { sumarPedidos, tasasDe, type PedidosParaTasa } from "./costos-operacion";
import { topeDeProducto, type TopeProducto } from "./limite";

/** Lo que hace falta del análisis guardado: los pedidos de cada producto y los de toda la tienda. */
export interface EntregasGuardadas {
  entrega?: readonly (PedidosParaTasa & { clave: string })[];
  pedidosDeLaTienda?: PedidosParaTasa | null;
}

/** Una función que da el tope de cualquier producto (por la llave de su nombre). Sin análisis guardado, cada producto queda con su tope a mano o el general. */
export function calculadorDeTopes(manual: ReadonlyMap<string, number>, analisis: EntregasGuardadas | null | undefined): (clave: string) => TopeProducto {
  const porClave = new Map((analisis?.entrega ?? []).map((f) => [f.clave, f]));
  const tienda = tasasDe(analisis?.pedidosDeLaTienda ?? (analisis?.entrega?.length ? sumarPedidos(analisis.entrega) : null));
  const hechos = new Map<string, TopeProducto>();
  return (clave) => {
    let t = hechos.get(clave);
    if (!t) {
      t = topeDeProducto(manual.get(clave), porClave.get(clave), tienda);
      hechos.set(clave, t);
    }
    return t;
  };
}

/** Lo mismo, leyendo todo de la base para un país. */
export async function leerTopes(supabase: SupabaseClient, paisId: string): Promise<(clave: string) => TopeProducto> {
  const [{ data: manuales }, { data: fila }] = await Promise.all([
    supabase.from("meta_topes").select("producto_clave, cpa_tope"),
    supabase.from("meta_ajustes").select("valor").eq("clave", claveDeAnalisis(paisId)).maybeSingle(),
  ]);
  const manual = new Map((manuales ?? []).map((t) => [t.producto_clave as string, Number(t.cpa_tope) || 0]));
  const valor = fila?.valor as { analisis?: EntregasGuardadas } | null | undefined;
  return calculadorDeTopes(manual, valor?.analisis);
}
