import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import type { FilaVencimiento } from "./def-vencimientos";
import { TablaVencimientos } from "./tabla-vencimientos";

export const metadata = { title: "Vencimientos" };

export const dynamic = "force-dynamic";

/** Los lotes con unidades del país, del que vence antes al que vence después: lo vencido y lo que está por vencer primero. */
export default async function VencimientosPage() {
  await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data, error } = await supabase.rpc("wms_vigilancia_vencimientos", { p_pais: pais.id });

  const filas: FilaVencimiento[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: `${r.sku_maestro_id}-${r.lote_id}`,
    skuId: String(r.sku_maestro_id),
    sku: String(r.sku),
    producto: String(r.nombre),
    lote: String(r.lote),
    vence: String(r.fecha_vencimiento),
    dias: Number(r.dias_restantes),
    cantidad: Number(r.cantidad),
    estado: r.estado as FilaVencimiento["estado"],
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Vencimientos" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar los vencimientos.
        </p>
      ) : (
        <TablaVencimientos filas={filas} />
      )}
    </Pagina>
  );
}
