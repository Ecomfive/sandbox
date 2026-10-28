import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { accesoCrm, areasVisibles } from "@/lib/crm/areas";
import { permisosBandeja } from "@/lib/crm/permisos-bandeja";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { config360 } from "@/lib/whatsapp/proveedor";
import { Bandeja } from "./bandeja";
import { cargarBandeja } from "./datos-bandeja";

export const metadata = { title: "Bandeja de WhatsApp" };

export const dynamic = "force-dynamic";

/** CRM Dropshippers › Bandeja de WhatsApp (26 oct 2026): los chats de los números de la empresa, para contestar desde el sistema. */
export default async function BandejaWhatsappPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requirePestana("crm-dropshippers", "bandeja");
  const { abrir } = await searchParams;
  const datos = await cargarBandeja(createServiceClient(), usuario);
  const a = accesoCrm(usuario);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Bandeja de WhatsApp">Los chats de los dropshippers con los números de la empresa: se contestan desde aquí, sin el celular.</EncabezadoPagina>
      {datos === null ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0158 (WhatsApp) en la base.
        </p>
      ) : (
        <Bandeja
          inicial={datos}
          abrirInicial={typeof abrir === "string" ? abrir : null}
          escribe={a.escribeAtencion || a.escribeComercial || a.escribeDireccion}
          miId={usuario.id}
          areas={areasVisibles(a)}
          permisos={permisosBandeja(usuario.afinado)}
          estado360={
            // Solo para quien administra: qué datos de 360dialog tiene el servidor (si están, nunca su valor).
            esAdministrador(usuario)
              ? { clave: !!config360(), sandbox: !!config360()?.sandbox, palabraSecreta: (process.env.D360_WEBHOOK_CLAVE?.length ?? 0) >= 16 }
              : null
          }
        />
      )}
    </Pagina>
  );
}
