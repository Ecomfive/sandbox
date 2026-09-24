import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaBodega } from "./def-bodegas";
import { TablaBodegas } from "./tabla-bodegas";

export const metadata = { title: "Bodegas" };

export const dynamic = "force-dynamic";

export default async function WmsBodegasPage() {
  const usuario = await requireModulo("wms-bodegas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data } = await supabase
    .from("wms_bodegas")
    .select("id, nombre, codigo, tipo, direccion, contacto, notas, activa, orden, creado_en")
    .eq("pais_id", pais.id)
    .order("orden")
    .order("nombre");

  const filas: FilaBodega[] = (data ?? []).map((b) => ({
    id: b.id as string,
    nombre: b.nombre as string,
    codigo: (b.codigo as string | null) ?? "",
    tipo: b.tipo as string,
    direccion: (b.direccion as string | null) ?? "",
    contacto: (b.contacto as string | null) ?? "",
    notas: (b.notas as string | null) ?? "",
    activa: b.activa === true,
    orden: Number(b.orden),
    creado: (b.creado_en as string).slice(0, 10),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Bodegas" oculto />
      <TablaBodegas bodegas={filas} paisId={pais.id} codigoPais={pais.codigo} puedeEscribir={!usuario.modulosSoloLectura.includes("wms-bodegas")} />
    </Pagina>
  );
}
