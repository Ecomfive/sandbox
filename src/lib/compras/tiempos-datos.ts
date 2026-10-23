// Lo que tardaron los envíos que ya llegaron, leído de la base: lo usan Compras (planificación automática) y el portal del proveedor
// (cuando Shen Zhen marca un envío). Solo servidor.

import { tiemposDeTransito, type TiemposTransito } from "@/lib/compras/planificacion";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

/** De qué país es una compra para medir sus envíos: su país, o Importadora. */
export const claveTransito = (tipo: string, paisId: string | null) => (tipo === "importacion" ? "importacion" : (paisId ?? ""));

/** Lo que tardaron los envíos que ya llegaron (fecha de envío → fecha de llegada), por país y vía. */
export async function cargarTiempos(): Promise<TiemposTransito> {
  const filas = await traerTodasLasFilas<{ tipo: string; pais_id: string | null; via_envio: string[] | null; fecha_envio: string; fecha_llegada: string }>((desde, hasta) =>
    createServiceClient()
      .from("wms_compras")
      .select("tipo, pais_id, via_envio, fecha_envio, fecha_llegada")
      .not("fecha_envio", "is", null)
      .not("fecha_llegada", "is", null)
      .is("anulada_en", null)
      .order("id")
      .range(desde, hasta),
  );
  // Una compra que viajó por dos vías no dice cuánto tarda cada una: no se mide.
  return tiemposDeTransito(
    filas
      .filter((f) => (f.via_envio ?? []).length === 1)
      .map((f) => ({ clave: claveTransito(f.tipo, f.pais_id), via: f.via_envio![0], dias: Math.round((Date.parse(f.fecha_llegada) - Date.parse(f.fecha_envio)) / 864e5) })),
  );
}
