import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import type { FilaStock } from "./def-stock";
import { TablaStock } from "./tabla-stock";

export const metadata = { title: "Inventario" };

export const dynamic = "force-dynamic";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Inventario por cubetas (WMS, fase B): cada SKU maestro con lo que hay en las bodegas del país (o en una). Nace vacío: los
 * productos están todos, en cero, y las cantidades llegan con entradas, salidas y sincronizaciones. Un combo no guarda
 * stock: sale de sus componentes.
 */
export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { bodega } = await searchParams;
  const bodegaPedida = typeof bodega === "string" && ES_ID(bodega) ? bodega : null;

  const { data: bodegasPais } = await supabase
    .from("wms_bodegas")
    .select("id, nombre, tipo, activa")
    .eq("pais_id", pais.id)
    .order("tipo")
    .order("nombre");
  const bodegas = bodegasPais ?? [];
  // Solo vale una bodega del país actual.
  const bodegaElegida = bodegaPedida && bodegas.some((b) => b.id === bodegaPedida) ? bodegaPedida : "";

  const idsPropias = bodegas.filter((b) => b.tipo === "propia" && b.activa).map((b) => b.id as string);
  const [resumen, ubicaciones] = await Promise.all([
    supabase.rpc("wms_stock_resumen", { p_pais: pais.id, p_bodega: bodegaElegida || null }),
    idsPropias.length > 0
      ? supabase.from("wms_ubicaciones").select("id, bodega_id, codigo, propiedad").in("bodega_id", idsPropias).eq("activa", true).order("codigo")
      : Promise.resolve({ data: [] as { id: string; bodega_id: string; codigo: string; propiedad: string }[] }),
  ]);

  const filas: FilaStock[] = ((resumen.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.sku_maestro_id),
    codigo: String(r.codigo),
    nombre: String(r.nombre),
    tipo: String(r.tipo),
    fisico: Number(r.fisico),
    reservado: Number(r.reservado),
    disponible: Number(r.disponible),
    danado: Number(r.danado),
    inspeccion: Number(r.inspeccion),
    retenido: Number(r.retenido),
    enCamino: Number(r.en_camino),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Inventario" oculto />
      {resumen.error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudo cargar el inventario.
        </p>
      ) : (
        <TablaStock
          key={bodegaElegida}
          filas={filas}
          bodegas={bodegas.map((b) => ({ id: b.id as string, nombre: b.nombre as string, externa: b.tipo === "externa" }))}
          bodegaElegida={bodegaElegida}
          bodegasPropias={bodegas.filter((b) => b.tipo === "propia" && b.activa).map((b) => ({ id: b.id as string, nombre: b.nombre as string }))}
          ubicaciones={(ubicaciones.data ?? []).map((u) => ({ id: u.id, bodegaId: u.bodega_id, codigo: u.codigo, propiedad: u.propiedad }))}
          puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")}
        />
      )}
    </Pagina>
  );
}
