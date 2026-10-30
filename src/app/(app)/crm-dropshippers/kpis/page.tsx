import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { MODULO_DIRECCION } from "@/lib/crm/areas";
import { rutaVista } from "../direccion/ruta";

export const dynamic = "force-dynamic";

/** La antigua pestaña CRM › KPIs de atención. Desde el 30 oct 2026 los KPIs están en el Resumen de la Bandeja de Dirección: esta dirección lleva allá. */
export default async function KpisAtencionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireModulo(MODULO_DIRECCION);
  const { dias } = await searchParams;
  redirect(rutaVista("resumen", typeof dias === "string" ? { dias } : {}));
}
