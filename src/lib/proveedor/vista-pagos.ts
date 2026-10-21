// Portal del proveedor: convertir el estado de pagos en lo que se manda al navegador (filas ya resueltas y enlaces firmados de los
// comprobantes). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvisoVista, FilaPlazo } from "@/components/proveedor/pagos-proveedor";
import { estadoCuota } from "./cuotas";
import type { AvisoPago } from "./pagos-datos";
import type { EnvioConCuotas } from "./resumen-pagos";
import { BUCKET_PROVEEDOR } from "./rutas";

/** Los últimos envíos con su anticipo y su saldo resueltos para la tabla de plazos. */
export function filasPlazos(envios: EnvioConCuotas[], hoy: string, cuantos = 60): FilaPlazo[] {
  return envios.slice(0, cuantos).flatMap((e) => {
    const anticipo = e.cuotas.find((c) => c.cuota === "anticipo");
    if (!anticipo) return [];
    const saldo = e.cuotas.find((c) => c.cuota === "saldo");
    return [
      {
        clave: e.clave,
        producto: e.producto,
        paisCodigo: e.paisCodigo,
        fechaEnvio: e.fechaEnvio,
        montoTotal: e.montoTotal,
        anticipo: { monto: anticipo.monto, vence: anticipo.vence, estado: estadoCuota(anticipo, hoy) },
        saldo: saldo ? { monto: saldo.monto, vence: saldo.vence, estado: estadoCuota(saldo, hoy) } : null,
      },
    ];
  });
}

/** Los avisos con el enlace firmado (una hora) de su comprobante. */
export async function avisosParaVista(supabase: SupabaseClient, avisos: AvisoPago[]): Promise<AvisoVista[]> {
  const rutas = avisos.map((a) => a.comprobanteRuta).filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUrls(rutas, 3600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }
  return avisos.map(({ comprobanteRuta, ...a }) => ({ ...a, comprobanteUrl: comprobanteRuta ? (firmadas.get(comprobanteRuta) ?? null) : null }));
}
