import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { Borrados } from "./borrados";
import { cargarBorrados } from "./datos-borrados";

export const metadata = { title: "Borrados de WhatsApp" };

export const dynamic = "force-dynamic";

/** CRM Dropshippers › Borrados (28 oct 2026): las peticiones de borrar un chat o un mensaje de WhatsApp, que solo se borra con autorización. */
export default async function BorradosWhatsappPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const esAdmin = esAdministrador(usuario);
  const datos = await cargarBorrados(createServiceClient(), usuario, esAdmin);
  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Borrados de WhatsApp">Nadie borra un chat ni un mensaje por su cuenta: se pide, y lo autoriza la persona por encima.</EncabezadoPagina>
      {datos === null ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0172 (borrado con autorización) en la base.
        </p>
      ) : (
        <Borrados inicial={datos} esAdmin={esAdmin} />
      )}
    </Pagina>
  );
}
