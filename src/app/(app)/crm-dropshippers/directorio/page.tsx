import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { AvisoDemo } from "../aviso-demo";
import { obtenerDatosCrm } from "../datos-crm";
import { TablaDirectorio } from "../tabla-directorio";

export const metadata = { title: "Dropshippers" };

export const dynamic = "force-dynamic";

export default async function DirectorioDropshippersPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await obtenerDatosCrm(supabase, pais.id);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dropshippers" oculto />
      {datos.demo && <AvisoDemo />}
      <TablaDirectorio
        dropshippers={datos.dropshippers}
        casos={datos.casos}
        paisId={pais.id}
        codigoPais={pais.codigo}
        hoy={datos.hoy}
        demo={datos.demo}
        puedeEscribir={puedeEscribir}
      />
    </Pagina>
  );
}
