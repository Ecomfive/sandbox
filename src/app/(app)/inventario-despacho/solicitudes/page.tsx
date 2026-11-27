import { redirect } from "next/navigation";
import { AvisosVistos } from "@/components/avisos-vistos";
import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Solicitud de inventario" };

export const dynamic = "force-dynamic";

/** Inventario despacho › Solicitud de inventario (16 nov 2026, migración 0305): despacho le pide a inventario lo que se agotó y marca «Recibido» al llegar. */
export default async function PedirInventarioPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-pedir-inventario");
  const sp = await searchParams;
  // El enlace viejo «?archivados=1» ahora es la sección «Archivos de solicitudes».
  if (sp.archivados === "1") redirect("/inventario-despacho/archivo");
  return (
    <>
      <AvisosVistos seccion="solicitudes" />
      <PaginaPedidos modo="despacho" usuario={usuario} estado={typeof sp.estado === "string" ? sp.estado : undefined} />
    </>
  );
}
