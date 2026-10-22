import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * «Portal del proveedor» se quitó (22 oct 2026, pedido de Hernán): el Tablero de Chin, Pagos a Chin y la Cuenta de Chin viven ahora en
 * Compras › Tablero de Chin. Esta ruta solo lleva ahí a los enlaces viejos (avisos de la campana, favoritos).
 */
export default async function PortalProveedorPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireModulo("compras");
  const { tab } = await searchParams;
  redirect(tab === "pagos" ? "/compras/tablero-chin?ver=pagos" : "/compras/tablero-chin");
}
