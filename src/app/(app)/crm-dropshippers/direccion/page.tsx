import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { MODULO_DIRECCION } from "@/lib/crm/areas";
import { rutaVista, VISTAS_DIRECCION, type VistaDireccion } from "./ruta";

export const dynamic = "force-dynamic";

/**
 * La antigua pestaña CRM › Dirección. Desde el 30 oct 2026 (pedido de Hernán) el panel es la Bandeja de Dirección: esta dirección lleva allá con
 * la misma vista (sin vista, el Resumen).
 */
export default async function DireccionCrmPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireModulo(MODULO_DIRECCION);
  const { vista, dias } = await searchParams;
  const destino: VistaDireccion = VISTAS_DIRECCION.find((v) => v.valor === vista && v.valor !== "chats")?.valor ?? "resumen";
  redirect(rutaVista(destino, typeof dias === "string" ? { dias } : {}));
}
