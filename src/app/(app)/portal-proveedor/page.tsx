import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * «Portal del proveedor» se quitó (22 oct 2026, pedido de Hernán): el Tablero de Shen Zhen, Pagos a Shen Zhen y la Cuenta de Shen Zhen viven ahora en
 * Compras › Tablero de Shen Zhen. Esta ruta solo lleva ahí a los enlaces viejos (avisos de la campana, favoritos).
 */
export default async function PortalProveedorPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireModulo("compras");
  const { tab } = await searchParams;
  redirect(tab === "pagos" ? "/compras/tablero-chin?ver=pagos" : "/compras/tablero-chin");
}
