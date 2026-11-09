import { hoyPanama } from "@/lib/af4/fecha";
import { cargarPosicion } from "@/lib/finanzas/cargar-tesoreria";
import { createServiceClient } from "@/lib/supabase/server";
import { PosicionCajaAF4 } from "./posicion-caja";

/** La tarjeta de posición de caja del Panel financiero (se carga aparte, dentro de un `Suspense`, para no frenar el Panel). */
export async function PosicionCajaPanel() {
  const hoy = hoyPanama();
  const v = await cargarPosicion(createServiceClient(), hoy);
  if (!v.posicion.partidas.length) return null;
  return <PosicionCajaAF4 posicion={v.posicion} hoy={hoy} diasViejo={v.config.saldoDias} compacta />;
}
