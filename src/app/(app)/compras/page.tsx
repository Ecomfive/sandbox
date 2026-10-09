import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Compras abre en la pestaña «Compras» (la lista), pedido de Hernán (8 oct 2026). El Informe vive en `/compras/informe`. Se
 * conserva la vista pedida (`?ver=PA`).
 */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("compras");
  const { ver } = await searchParams;
  redirect(typeof ver === "string" ? `/compras/lista?ver=${encodeURIComponent(ver)}` : "/compras/lista");
}
