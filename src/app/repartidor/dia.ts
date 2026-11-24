import { rangoDespacho } from "@/lib/despacho/datos";
import { diaVisible } from "@/lib/despacho/panel-repartidor";

/** El día que mira el panel: hoy (en Panamá) o, con `?dia=`, otro de la semana en curso (de lunes a hoy; cada lunes empieza de nuevo). */
export function diaDelPanel(pedido: unknown): { dia: string; hoy: string } {
  const { hoy } = rangoDespacho(1);
  return { dia: diaVisible(pedido, hoy), hoy };
}
