import { rangoDespacho } from "@/lib/despacho/datos";
import { sumarDias } from "@/lib/despacho/panel-repartidor";

/** El día que mira el panel: hoy (en Panamá) o, con `?dia=`, uno de los dos anteriores (lo que quedó sin marcar). */
export function diaDelPanel(pedido: unknown): string {
  const { hoy } = rangoDespacho(1);
  return typeof pedido === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido <= hoy && pedido >= sumarDias(hoy, -2) ? pedido : hoy;
}
