import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { ListaEnvios, type FilaEnvio } from "./lista-envios";

export const metadata = { title: "Envíos a Dropi" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Los envíos a la bodega de Dropi del país: los que siguen en camino primero (para anotar cuántas unidades dice Dropi que
 * llegaron) y después los ya recibidos, con su diferencia.
 */
export default async function EnviosDropiPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data, error } = await supabase
    .from("wms_envios_dropi")
    .select(
      "id, enviado_en, enviada, recibida, estado, referencia, motivo_diferencia, recibido_en, skus_maestros(codigo, nombre, foto_url), wms_bodegas!wms_envios_dropi_bodega_origen_id_fkey!inner(nombre, pais_id)",
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
      <EncabezadoPagina titulo="Envíos a Dropi" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {/wms_envios_dropi/.test(error.message) ? "Falta correr la migración 0214 en la base." : "No se pudieron cargar los envíos."}
        </p>
      ) : (
        <ListaEnvios filas={filas} puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")} />
      )}
    </Pagina>
  );
}
