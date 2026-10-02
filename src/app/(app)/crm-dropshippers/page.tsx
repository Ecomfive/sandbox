import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { obtenerDatosCrm } from "./datos-crm";
import { ResumenCrm } from "./resumen-crm";

export const metadata = { title: "CRM Dropshippers" };

export const dynamic = "force-dynamic";

export default async function CrmDropshippersPage() {
  await requireModulo("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await obtenerDatosCrm(supabase, pais.id);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="CRM Dropshippers" oculto />
      <ResumenCrm
        resumen={datos.resumen}
        dropshippers={datos.dropshippers}
        casos={datos.casos}
        codigoPais={pais.codigo}
        hoy={datos.hoy}
      />
    </Pagina>
  );
}
