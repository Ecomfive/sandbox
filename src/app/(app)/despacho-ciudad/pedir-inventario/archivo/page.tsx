import { PaginaPedidos } from "@/components/pedidos-inventario/pagina-pedidos";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Archivo de pedidos" };

export const dynamic = "force-dynamic";

/** Despacho ciudad › Archivo de pedidos (23 nov 2026, pedido de Jhokser): los pedidos a inventario ya realizados o cancelados que se archivaron, sin el límite de 30 días. */
export default async function ArchivoPedirInventarioPage() {
  const usuario = await requireModulo("despacho-pedir-inventario");
  return <PaginaPedidos modo="despacho" usuario={usuario} estado={undefined} archivados />;
}
