import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { accesoCrm, areasVisibles, pierdeLoBorrado } from "@/lib/crm/areas";
import { requireModulo } from "@/lib/auth";
import { normalizar } from "@/lib/tabla/motor";
import { contarSinResponder } from "./bandeja/sin-responder";
import { obtenerDatosCrm } from "./datos-crm";
import { ListaDropshippers } from "./lista-dropshippers";

export const metadata = { title: "CRM Dropshippers" };

export const dynamic = "force-dynamic";

/**
 * CRM Dropshippers (rediseño del 26 oct 2026, al estilo de Gestión de IDs Dropi): el tablero de lo que hay que atender, la lista de
 * dropshippers con su WhatsApp y la ficha de cada uno. `?abrir=<id>` abre una ficha; `?buscar=<nombre>` (del buscador global) abre la
 * del dropshipper que se llama así. El tablero de antes (indicadores y ranking) está en la pestaña Ranking.
 */
export default async function CrmDropshippersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("crm-dropshippers");
  const { abrir, buscar } = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const acceso = accesoCrm(usuario);
  const areas = areasVisibles(acceso);
  const [datos, sinResponder] = await Promise.all([obtenerDatosCrm(supabase, pais.id, areas), contarSinResponder(supabase, areas, pierdeLoBorrado(acceso))]);
  let abrirInicial = typeof abrir === "string" ? abrir : null;
  if (!abrirInicial && typeof buscar === "string" && buscar.trim()) {
    const q = normalizar(buscar.trim());
    abrirInicial = (datos.dropshippers.find((d) => normalizar(d.nombre) === q) ?? datos.dropshippers.find((d) => normalizar(`${d.nombre} ${d.codigo}`).includes(q)))?.id ?? null;
  }
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="CRM Dropshippers" oculto />
      <ListaDropshippers
        dropshippers={datos.dropshippers}
        casos={datos.casos}
        paisId={pais.id}
        codigoPais={pais.codigo}
        hoy={datos.hoy}
        acceso={acceso}
        abrirInicial={abrirInicial}
        sinResponder={sinResponder}
      />
    </Pagina>
  );
}
