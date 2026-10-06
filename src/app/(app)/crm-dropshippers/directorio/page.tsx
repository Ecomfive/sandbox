import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { accesoCrm } from "@/lib/crm/areas";
import { requireModulo } from "@/lib/auth";
import { obtenerDatosCrm } from "../datos-crm";
import { TablaDirectorio } from "../tabla-directorio";

export const metadata = { title: "Dropshippers" };

export const dynamic = "force-dynamic";

export default async function DirectorioDropshippersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("crm-dropshippers");
  const { buscar, abrir } = await searchParams;
  const buscarInicial = typeof buscar === "string" ? buscar : "";
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await obtenerDatosCrm(supabase, pais.id);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dropshippers" oculto />
      <TablaDirectorio
        key={`${buscarInicial}-${typeof abrir === "string" ? abrir : ""}`}
        buscarInicial={buscarInicial}
        abrirInicial={typeof abrir === "string" ? abrir : null}
        dropshippers={datos.dropshippers}
        casos={datos.casos}
        paisId={pais.id}
        codigoPais={pais.codigo}
        hoy={datos.hoy}
        acceso={accesoCrm(usuario)}
      />
    </Pagina>
  );
}
