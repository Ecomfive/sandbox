import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Solicitudes de despacho" };

export const dynamic = "force-dynamic";

/** Comunicación despacho › Solicitudes de despacho (antes «Pedidos de despacho»; nombre del 19 nov 2026, pedido de Hernán) (16 nov 2026, migración 0305): Dinora atiende lo que pide despacho; «Enviar» hace el traslado a la bodega de despacho. */
export default async function PedidosDespachoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("inventario-pedidos-despacho");
  const sp = await searchParams;
  return <PaginaPedidos modo="inventario" usuario={usuario} estado={typeof sp.estado === "string" ? sp.estado : undefined} />;
}
