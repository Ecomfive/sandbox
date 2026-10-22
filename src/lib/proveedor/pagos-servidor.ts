// Portal del proveedor: el estado de pagos de un proveedor, armado en el servidor para las dos vistas y para validar un aviso de pago
// (los montos de un aviso salen de aquí, nunca de lo que mande el navegador). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Espejo } from "./datos";
import { hoyPanama } from "./fechas";
import { cargarPagosProveedor, type AvisoPago } from "./pagos-datos";
import { claveCuota, cuotasPorPagar, enviosConCuotas, resumenPagos, type CuotaPorPagar, type EnvioConCuotas, type ResumenPagos } from "./resumen-pagos";

/** Desde cuándo se mide el cumplimiento de los anticipos en los indicadores. */
export const CUMPLIMIENTO_DESDE = "2026-01-01";

export interface EstadoPagos {
  envios: EnvioConCuotas[];
  porPagar: CuotaPorPagar[];
  resumen: ResumenPagos;
  avisos: AvisoPago[];
}

export async function estadoPagos(supabase: SupabaseClient, espejo: Espejo): Promise<EstadoPagos | { error: string }> {
  const r = await cargarPagosProveedor(supabase, espejo.proveedor.id);
  if ("error" in r) return r;
  const hoy = hoyPanama();
  const envios = enviosConCuotas(espejo.pedidos, r.datos, espejo.proveedor.porcentajeAnticipo, espejo.proveedor.diasAnticipo);
  const avisadas = new Set(r.avisos.filter((a) => a.estado === "avisado").flatMap((a) => a.cuotas.map((c) => claveCuota(c.pedidoId, c.cuota))));
  const porPagar = cuotasPorPagar(envios, hoy, avisadas);
  return { envios, porPagar, resumen: resumenPagos(envios, porPagar, hoy, CUMPLIMIENTO_DESDE), avisos: r.avisos };
}
