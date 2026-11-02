import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm, pierdeLoBorrado } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { Borrados } from "./borrados";
import { cargarBorrados } from "./datos-borrados";

export const metadata = { title: "Borrados de WhatsApp" };

export const dynamic = "force-dynamic";

/** CRM Dropshippers › Borrados (2 nov 2026): lo que se borró desde el sistema. Quien tiene solo Atención no lo ve (para ella ya no existe), como en WhatsApp. */
export default async function BorradosWhatsappPage() {
  const usuario = await requireModulo("crm-dropshippers");
  if (pierdeLoBorrado(accesoCrm(usuario))) redirect("/crm-dropshippers");
  const borrados = await cargarBorrados(createServiceClient());
  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Borrados de WhatsApp" oculto />
      {borrados === null ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0219 (borrar sin autorización) en la base.
        </p>
      ) : (
        <Borrados borrados={borrados} esAdmin={esAdministrador(usuario)} />
      )}
    </Pagina>
  );
}
