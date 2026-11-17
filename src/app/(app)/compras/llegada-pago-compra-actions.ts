"use server";

import { requireModulo } from "@/lib/auth";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "./acceso-compras";

/**
 * La llegada «En Bodega» más reciente de una compra, para llevar desde su ficha a registrar el pago (17 nov 2026: los pagos los registra quien gestiona Compras, no quien recibe el aviso).
 * Null si la compra no tiene una llegada de bodega (por ejemplo, se pasó a En Bodega antes de que existieran los avisos).
 */
export async function obtenerLlegadaDePago(compraId: string): Promise<{ llegadaId: string; pagada: boolean } | null> {
  const usuario = await requireModulo("compras");
  if (!esUuid(compraId)) return null;
  if (await sinAccesoACompras([compraId], usuario)) return null;
  const { data } = await createServiceClient()
    .from("compras_llegada_items")
    .select("llegada_id, pagado_en, compras_llegadas!inner(tipo, creado_en)")
    .eq("compra_id", compraId)
    .eq("compras_llegadas.tipo", "bodega")
    .order("creado_en", { ascending: false })
    .limit(1);
  const f = (data ?? [])[0] as { llegada_id: string; pagado_en: string | null } | undefined;
  return f ? { llegadaId: f.llegada_id, pagada: !!f.pagado_en } : null;
}
