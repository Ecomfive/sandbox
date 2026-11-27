// App del delivery › Mis pagos (25 nov 2026): lo que lee la pantalla. Las semanas que Despacho le mandó (fijas) y, en vivo, la semana en curso y la
// anterior mientras Despacho no la manda. Todo sale de su cuenta (su delivery por su nombre en Envíos Delivery), nunca del navegador. Solo servidor.

import { inicioSemanaPago, sumarDiasPago, type ResumenDelivery } from "@/lib/despacho/control-envios";
import { cargarSemanas, deliveryDeCourier, resumenEnVivo, semanasDelDelivery, type Delivery, type SemanaGuardada } from "@/lib/despacho/datos-control";
import { rangoDespacho } from "@/lib/despacho/datos";
import type { CuentaRepartidor } from "@/lib/despacho/cuenta-repartidor";
import { createServiceClient } from "@/lib/supabase/server";

export interface SemanaEnVivo {
  jueves: string;
  resumen: ResumenDelivery;
  nota: string | null;
}

export interface DatosPagos {
  delivery: Delivery;
  /** Las semanas mandadas (enviadas o firmadas), de la más nueva a la más vieja. */
  semanas: SemanaGuardada[];
  /** La semana en curso, en vivo. */
  enCurso: SemanaEnVivo;
  /** La semana anterior, en vivo, mientras Despacho todavía no la manda (el jueves por la mañana). */
  porCerrar: SemanaEnVivo | null;
}

export async function datosPagos(cuenta: CuentaRepartidor): Promise<DatosPagos | null> {
  const supabase = createServiceClient();
  const delivery = await deliveryDeCourier(supabase, cuenta.courier);
  if (!delivery) return null;
  const jueves = inicioSemanaPago(rangoDespacho(1).hoy);
  const anterior = sumarDiasPago(jueves, -7);
  const [semanas, deEsta, deLaAnterior] = await Promise.all([semanasDelDelivery(supabase, delivery.id), cargarSemanas(supabase, jueves), cargarSemanas(supabase, anterior)]);
  const vivo = async (j: string, s: SemanaGuardada | undefined): Promise<SemanaEnVivo> => ({ jueves: j, resumen: await resumenEnVivo(supabase, delivery, j, s?.ajustes ?? []), nota: s?.nota ?? null });
  const previa = deLaAnterior.get(delivery.id);
  const [enCurso, porCerrar] = await Promise.all([vivo(jueves, deEsta.get(delivery.id)), !previa || previa.estado === "abierta" ? vivo(anterior, previa) : Promise.resolve(null)]);
  return { delivery, semanas, enCurso, porCerrar: porCerrar && porCerrar.resumen.asignados > 0 ? porCerrar : null };
}
