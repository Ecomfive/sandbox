import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { accesoCrm, areasVisibles } from "@/lib/crm/areas";
import { permisosBandeja } from "@/lib/crm/permisos-bandeja";
import { requirePestana } from "@/lib/auth";
import { obtenerDatosCrm } from "../datos-crm";
import { ResumenCrm } from "../resumen-crm";

export const metadata = { title: "Ranking de dropshippers" };

export const dynamic = "force-dynamic";

/** CRM › Ranking: los indicadores del mes, quién vende más y los casos que piden atención (la portada del CRM hasta el 26 oct 2026). */
export default async function RankingDropshippersPage() {
  const usuario = await requirePestana("crm-dropshippers", "ranking");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const acceso = accesoCrm(usuario);
  const datos = await obtenerDatosCrm(supabase, pais.id, areasVisibles(acceso), permisosBandeja(usuario.afinado).alcance === "mias-y-libres" ? usuario.id : null);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ranking de dropshippers" oculto />
      <ResumenCrm resumen={datos.resumen} dropshippers={datos.dropshippers} casos={datos.casos} codigoPais={pais.codigo} hoy={datos.hoy} acceso={acceso} />
    </Pagina>
  );
}
