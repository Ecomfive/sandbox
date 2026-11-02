import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm } from "@/lib/crm/areas";
import { motivosRecurrentes } from "../bandeja/actividad-actions";
import { Motivos } from "./motivos";

export const metadata = { title: "Motivos de contacto" };

export const dynamic = "force-dynamic";
// Analizar varios chats seguidos con la IA puede tardar.
export const maxDuration = 300;

/** CRM Dropshippers › Motivos (29 oct 2026): por qué escriben los dropshippers y qué inquietudes se repiten más, a partir del análisis con IA de sus chats. */
export default async function MotivosPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const inicial = await motivosRecurrentes(30);
  const acceso = accesoCrm(usuario);
  const puedeAnalizar = acceso.escribeAtencion || acceso.escribeComercial || acceso.escribeDireccion;
  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Motivos" oculto />
      {"error" in inicial ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {inicial.error}
        </p>
      ) : (
        <Motivos inicial={inicial} puedeAnalizar={puedeAnalizar} />
      )}
    </Pagina>
  );
}
