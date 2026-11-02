import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { listarTareas } from "./actions";
import { PanelTareas } from "./panel-tareas";

export const metadata = { title: "Tareas del CRM" };

export const dynamic = "force-dynamic";

/** CRM Dropshippers › Tareas (29 oct 2026): lo que hay que hacer con cada cliente, sacado de sus chats y de los seguimientos. */
export default async function TareasCrmPage() {
  await requireModulo("crm-dropshippers");
  const inicial = await listarTareas("mias");
  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Tareas">Lo que hay que hacer con cada cliente. Te llega un aviso en la campana cuando una tarea es para hoy o cuando llega el producto que esperaba.</EncabezadoPagina>
      {"error" in inicial ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {inicial.error}
        </p>
      ) : (
        <PanelTareas inicial={inicial.tareas} />
      )}
    </Pagina>
  );
}
