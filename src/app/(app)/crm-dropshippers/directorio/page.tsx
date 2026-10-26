import { redirect } from "next/navigation";

/**
 * El directorio de dropshippers ahora es la página principal del CRM (rediseño del 26 oct 2026). Esta dirección queda para los
 * enlaces viejos (avisos «Para ti», buscador global): lleva a la lista con la misma ficha abierta o la misma búsqueda.
 */
export default async function DirectorioDropshippersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { buscar, abrir } = await searchParams;
  const p = new URLSearchParams();
  if (typeof abrir === "string" && abrir) p.set("abrir", abrir);
  if (typeof buscar === "string" && buscar) p.set("buscar", buscar);
  redirect(`/crm-dropshippers${p.size ? `?${p}` : ""}`);
}
