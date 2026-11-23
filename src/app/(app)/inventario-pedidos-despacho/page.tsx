import { redirect } from "next/navigation";
import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requirePanel } from "@/lib/auth";

export const metadata = { title: "Solicitudes de despacho" };

export const dynamic = "force-dynamic";

/** Comunicación despacho › Solicitudes de despacho (antes «Pedidos de despacho»; nombre del 19 nov 2026, pedido de Hernán) (16 nov 2026, migración 0305): Dinora atiende lo que pide despacho; «Enviar» hace el traslado a la bodega de despacho. */
export default async function PedidosDespachoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  // Quien solo tiene «Cuánto hay» (Nicol, 19 nov 2026) entra a esa pestaña en vez de ir a su inicio.
  const usuario = await requirePanel("/inventario-pedidos-despacho", "inventario-pedidos-despacho");
  const sp = await searchParams;
  // El enlace viejo «?archivados=1» ahora es la sección «Archivo de pedidos».
  if (sp.archivados === "1") redirect("/inventario-pedidos-despacho/archivo");
  return <PaginaPedidos modo="inventario" usuario={usuario} estado={typeof sp.estado === "string" ? sp.estado : undefined} />;
}
