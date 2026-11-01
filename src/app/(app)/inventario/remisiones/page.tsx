import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { ListaEnvios, type FilaEnvio } from "./lista-envios";

export const metadata = { title: "Remisiones" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Las remisiones a las bodegas externas del país (Dropi, Effi, Boxfull, Dunamixfy): las que siguen en camino primero (para
 * anotar cuántas unidades dice el tercero que llegaron) y después las ya recibidas, con su diferencia.
 */
export default async function RemisionesPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data, error } = await supabase
    .from("wms_envios_dropi")
    .select(
      "id, enviado_en, enviada, recibida, estado, referencia, motivo_diferencia, recibido_en, skus_maestros(codigo, nombre, foto_url), wms_bodegas!wms_envios_dropi_bodega_origen_id_fkey!inner(nombre, pais_id), destino:wms_bodegas!wms_envios_dropi_bodega_dropi_id_fkey(nombre)",
    )
    .eq("wms_bodegas.pais_id", pais.id)
    .order("estado")
    .order("enviado_en", { ascending: false })
    .limit(500);

  const filas: FilaEnvio[] = (data ?? []).map((e) => {
    const sku = uno(e.skus_maestros as { codigo: string; nombre: string; foto_url: string | null } | { codigo: string; nombre: string; foto_url: string | null }[] | null);
    return {
      id: e.id as string,
      codigo: sku?.codigo ?? "—",
      nombre: sku?.nombre ?? "",
      foto: sku?.foto_url ?? null,
      desde: uno(e.wms_bodegas as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
      hacia: uno(e.destino as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
      enviadoEn: e.enviado_en as string,
      enviada: Number(e.enviada),
      recibida: e.recibida === null ? null : Number(e.recibida),
      estado: e.estado as FilaEnvio["estado"],
      referencia: (e.referencia as string | null) ?? null,
      motivo: (e.motivo_diferencia as string | null) ?? null,
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Remisiones" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {/wms_envios_dropi/.test(error.message) ? "Falta correr la migración 0214 en la base." : "No se pudieron cargar las remisiones."}
        </p>
      ) : (
        <ListaEnvios filas={filas} puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")} />
      )}
    </Pagina>
  );
}
