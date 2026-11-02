import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { MODULO_DIRECCION } from "@/lib/crm/areas";
import { rutaVista } from "../direccion/ruta";

export const dynamic = "force-dynamic";

/** La antigua pestaña CRM › KPIs de atención. Desde el 3 nov 2026 la atención por WhatsApp está dentro de Equipo, en la Bandeja de Dirección: esta dirección lleva allá. */
export default async function KpisAtencionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireModulo(MODULO_DIRECCION);
  const { dias } = await searchParams;
  redirect(rutaVista("equipo", typeof dias === "string" ? { dias } : {}));
}
