import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaUbicacion } from "./def-ubicaciones";
import { TablaUbicaciones } from "./tabla-ubicaciones";

export const metadata = { title: "Ubicaciones" };

export const dynamic = "force-dynamic";

export default async function WmsUbicacionesPage() {
  const usuario = await requireModulo("wms-ubicaciones");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  // Primero las bodegas del país (las activas se ofrecen en «Agregar»); las ubicaciones son las de esas bodegas.
  const { data: bodegasData } = await supabase.from("wms_bodegas").select("id, nombre, activa, orden").eq("pais_id", pais.id).order("orden").order("nombre");
  const bodegasPais = bodegasData ?? [];
  const nombreBodega = new Map(bodegasPais.map((b) => [b.id as string, b.nombre as string]));

  const { data } = bodegasPais.length
    ? await supabase
        .from("wms_ubicaciones")
        .select("id, bodega_id, codigo, propiedad, tamano, codigo_barras, notas, activa, creado_en")
        .in("bodega_id", bodegasPais.map((b) => b.id as string))
        .order("codigo")
        .limit(2000)
    : { data: [] };

  const filas: FilaUbicacion[] = (data ?? []).map((u) => ({
    id: u.id as string,
    bodegaId: u.bodega_id as string,
    bodega: nombreBodega.get(u.bodega_id as string) ?? "—",
    codigo: u.codigo as string,
    propiedad: u.propiedad as string,
    tamano: (u.tamano as string | null) ?? "",
    codigoBarras: (u.codigo_barras as string | null) ?? "",
    notas: (u.notas as string | null) ?? "",
    activa: u.activa === true,
    creado: (u.creado_en as string).slice(0, 10),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ubicaciones" oculto />
      <TablaUbicaciones
        ubicaciones={filas}
        bodegas={bodegasPais.filter((b) => b.activa === true).map((b) => ({ id: b.id as string, nombre: b.nombre as string }))}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("wms-ubicaciones")}
      />
    </Pagina>
  );
}
