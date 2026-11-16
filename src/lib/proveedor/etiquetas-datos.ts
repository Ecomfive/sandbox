// Portal del proveedor: las imágenes de la etiqueta de las cajas de cada pedido, con una dirección para verlas (válida una hora). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PedidoPortal } from "./datos";
import { BUCKET_PROVEEDOR } from "./rutas";

/** Una imagen de etiqueta de cajas ya guardada, con su dirección para verla. */
export interface EtiquetaPedido {
  ruta: string;
  url: string;
}

/** Las direcciones de esas rutas (las que no se pueden firmar se dejan fuera). */
export async function direccionesDeEtiquetas(supabase: SupabaseClient, rutas: string[]): Promise<EtiquetaPedido[]> {
  if (!rutas.length) return [];
  const { data } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUrls(rutas, 3600);
  const porRuta = new Map((data ?? []).map((f) => [f.path, f.signedUrl]));
  return rutas.flatMap((ruta) => (porRuta.get(ruta) ? [{ ruta, url: porRuta.get(ruta)! }] : []));
}

/** Las etiquetas de varios pedidos, por id de pedido (solo los que tienen). */
export async function etiquetasDePedidos(supabase: SupabaseClient, pedidos: PedidoPortal[]): Promise<Record<string, EtiquetaPedido[]>> {
  const conEtiqueta = pedidos.filter((p) => p.etiquetasRutas.length > 0);
  const firmadas = await direccionesDeEtiquetas(supabase, conEtiqueta.flatMap((p) => p.etiquetasRutas));
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const res: Record<string, EtiquetaPedido[]> = {};
  for (const p of conEtiqueta) {
    const lista = p.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));
    if (lista.length) res[p.id] = lista;
  }
  return res;
}
