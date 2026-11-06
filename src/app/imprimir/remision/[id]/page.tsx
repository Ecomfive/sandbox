import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { numeroRemision } from "@/lib/wms/remision";
import { textoCajasEnviadas } from "@/lib/wms/cajas";
import { PapelRemision } from "./papel-remision";

export const metadata = { title: "Remisión" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * El papel de la remisión, el que va con la carga (pedido de Hernán, 6 nov 2026): fuera del menú para que salga limpio al imprimir.
 */
export default async function RemisionImprimirPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireModulo("inventario");
  const { id } = await params;
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) notFound();
  const supabase = createServiceClient();
  const { data: r } = await supabase
    .from("wms_remisiones")
    .select("id, numero, notas, creado_en, bodega_origen_id, origen:wms_bodegas!wms_remisiones_bodega_origen_id_fkey(nombre, paises(nombre)), destino:wms_bodegas!wms_remisiones_bodega_destino_id_fkey(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!r || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, r.bodega_origen_id as string))) notFound();
  const { data: lineas } = await supabase.from("wms_envios_dropi").select("id, enviada, skus_maestros(codigo, nombre, codigo_barras)").eq("remision_id", id).neq("estado", "anulado").order("id");
  // Las cajas de cada línea (migración 0236; sin ella, el papel sale sin ellas).
  const { data: conCajas } = await supabase.from("wms_envios_dropi").select("id, cajas").eq("remision_id", id);
  const cajasDe = new Map((conCajas ?? []).map((c) => [c.id as string, textoCajasEnviadas(c.cajas)]));

  const origen = uno(r.origen as { nombre: string; paises: { nombre: string } | { nombre: string }[] | null } | { nombre: string; paises: { nombre: string } | { nombre: string }[] | null }[] | null);
  const destino = uno(r.destino as { nombre: string } | { nombre: string }[] | null);
  const pais = uno(origen?.paises ?? null)?.nombre ?? "";
  const fecha = new Date(r.creado_en as string).toLocaleString("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Panama" });

  return (
    <PapelRemision
      d={{
        numero: numeroRemision(r.numero as number),
        fecha,
        desde: origen?.nombre ?? "—",
        hacia: destino?.nombre ?? "—",
        pais,
        notas: (r.notas as string | null) ?? null,
        lineas: (lineas ?? []).map((l) => {
          const sku = uno(l.skus_maestros as { codigo: string; nombre: string; codigo_barras: string | null } | { codigo: string; nombre: string; codigo_barras: string | null }[] | null);
          return { id: l.id as string, codigo: sku?.codigo ?? "—", nombre: sku?.nombre ?? "", barras: sku?.codigo_barras ?? null, enviada: Number(l.enviada), cajas: cajasDe.get(l.id as string) ?? null };
        }),
      }}
    />
  );
}
