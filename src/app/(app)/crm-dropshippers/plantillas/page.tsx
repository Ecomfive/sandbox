import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { conexionPlantillas } from "@/lib/whatsapp/api-plantillas";
import { cargarPlantillas } from "./datos-plantillas";
import { Plantillas } from "./plantillas";

export const metadata = { title: "Plantillas de WhatsApp" };

export const dynamic = "force-dynamic";

/** CRM Dropshippers › Plantillas de WhatsApp (28 oct 2026): crear, cambiar y mandar a Meta las plantillas, y ver cómo va cada una. */
export default async function PlantillasWhatsappPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const datos = await cargarPlantillas(createServiceClient());
  const a = accesoCrm(usuario);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Plantillas de WhatsApp">Los mensajes que Meta aprueba para escribirle a alguien pasadas 24 horas de su último mensaje.</EncabezadoPagina>
      {datos === null ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0170 (plantillas de WhatsApp) en la base.
        </p>
      ) : (
        <Plantillas inicial={datos} conexion={conexionPlantillas()} escribe={a.escribeAtencion || a.escribeComercial || a.escribeDireccion} esAdmin={esAdministrador(usuario)} />
      )}
    </Pagina>
  );
}
