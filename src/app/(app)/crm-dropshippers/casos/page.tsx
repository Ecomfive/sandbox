import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { accesoCrm } from "@/lib/crm/areas";
import { requireModulo } from "@/lib/auth";
import { obtenerDatosCrm } from "../datos-crm";
import { TablaCasos } from "../tabla-casos";

export const metadata = { title: "Casos" };

export const dynamic = "force-dynamic";

export default async function CasosDropshippersPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await obtenerDatosCrm(supabase, pais.id);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Casos" oculto />
      <TablaCasos
        casos={datos.casos}
        miNombre={usuario.nombre}
        dropshippers={datos.dropshippers.map((d) => ({ id: d.id, nombre: d.nombre, paises: d.paises }))}
        codigoPais={pais.codigo}
        puedeEscribir={accesoCrm(usuario).escribeAtencion}
      />
    </Pagina>
  );
}
