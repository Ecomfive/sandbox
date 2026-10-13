import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Test productos abre en la pestaña «Productos» (la lista), pedido de Hernán (13 oct 2026), como Compras. El Informe vive en
 * `/productos-test/informe`. Se conserva la búsqueda pedida (`?buscar=`).
 */
export default async function ProductosTestPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("productos-test");
  const { buscar } = await searchParams;
  redirect(typeof buscar === "string" ? `/productos-test/productos?buscar=${encodeURIComponent(buscar)}` : "/productos-test/productos");
}
