import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requirePanel } from "@/lib/auth";

export const metadata = { title: "Archivo de pedidos" };

export const dynamic = "force-dynamic";

/** Comunicación despacho › Archivo de pedidos (23 nov 2026, pedido de Jhokser): los pedidos ya realizados o cancelados que se archivaron, sin el límite de 30 días; «Sacar del archivo» los devuelve a la lista. */
export default async function ArchivoPedidosDespachoPage() {
  const usuario = await requirePanel("/inventario-pedidos-despacho", "inventario-pedidos-despacho");
  return <PaginaPedidos modo="inventario" usuario={usuario} estado={undefined} archivados />;
}
