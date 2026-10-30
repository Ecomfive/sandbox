import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm, areaPropia, areasVisibles } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { config360 } from "@/lib/whatsapp/proveedor";
import { ContenidoDireccion, PestanasDireccion } from "../direccion/contenido-direccion";
import { VISTAS_DIRECCION, type VistaDireccion } from "../direccion/ruta";
import { Bandeja } from "./bandeja";
import { cargarBandeja } from "./datos-bandeja";

export const metadata = { title: "Bandeja de WhatsApp" };

export const dynamic = "force-dynamic";
// «Analizar con IA» en la ficha del chat puede tardar en una conversación larga.
export const maxDuration = 300;

/**
 * CRM Dropshippers › Bandeja de WhatsApp (26 oct 2026): los chats de los números de la empresa, para contestar desde el sistema.
 * **Dirección** (quien tiene «CRM: dirección (CEO)», 30 oct 2026, pedido de Hernán): su bandeja de entrada es el panel de Dirección, como el
 * prototipo (Resumen con los KPIs de atención, Clientes, Productos, Entregas, Equipo, Duplicados y Automatizaciones); «Chats» es esta misma
 * bandeja de WhatsApp. Un enlace para abrir un chat (`?abrir=`) va directo a Chats. Los demás ven la bandeja de siempre.
 */
export default async function BandejaWhatsappPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("crm-dropshippers");
  const { abrir, vista: vistaParam, dias, segmento } = await searchParams;
  const a = accesoCrm(usuario);
  const vistaDireccion: VistaDireccion | null = !a.direccion
    ? null
    : typeof abrir === "string"
      ? "chats"
      : (VISTAS_DIRECCION.find((v) => v.valor === vistaParam)?.valor ?? "resumen");
  if (vistaDireccion && vistaDireccion !== "chats")
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Bandeja de entrada">La salud de la cartera, qué atender hoy, cómo trabaja el equipo y tus chats.</EncabezadoPagina>
        <PestanasDireccion vista={vistaDireccion} />
        <ContenidoDireccion usuario={usuario} vista={vistaDireccion} dias={dias} segmento={segmento} />
      </Pagina>
    );
  const datos = await cargarBandeja(createServiceClient(), usuario);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      {vistaDireccion ? (
        <>
          <EncabezadoPagina titulo="Bandeja de entrada">La salud de la cartera, qué atender hoy, cómo trabaja el equipo y tus chats.</EncabezadoPagina>
          <PestanasDireccion vista={vistaDireccion} />
        </>
      ) : (
        <EncabezadoPagina titulo="Bandeja de WhatsApp">Los chats de los dropshippers con los números de la empresa: se contestan desde aquí, sin el celular.</EncabezadoPagina>
      )}
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
          verTelefono={a.verTelefonos}
          areas={areasVisibles(a)}
          miArea={areaPropia(a)}
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
