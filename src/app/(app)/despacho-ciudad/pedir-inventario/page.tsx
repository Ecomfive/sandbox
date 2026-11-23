import { redirect } from "next/navigation";
import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Pedir a inventario" };

export const dynamic = "force-dynamic";

/** Gestión de tienda › Pedir a inventario (16 nov 2026, migración 0305): despacho le pide a inventario lo que se agotó y marca «Recibido» al llegar. */
export default async function PedirInventarioPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-pedir-inventario");
  const sp = await searchParams;
  // El enlace viejo «?archivados=1» ahora es la sección «Archivo de pedidos».
  if (sp.archivados === "1") redirect("/despacho-ciudad/pedir-inventario/archivo");
  return <PaginaPedidos modo="despacho" usuario={usuario} estado={typeof sp.estado === "string" ? sp.estado : undefined} />;
}
