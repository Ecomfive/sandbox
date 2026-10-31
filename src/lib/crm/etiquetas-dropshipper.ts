import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/auditoria";

/** Guarda las etiquetas de un dropshipper con su auditoría (lo usan esta ficha y la Bandeja de WhatsApp). */
export async function escribirEtiquetasDropshipper(
  supabase: SupabaseClient,
  id: string,
  nuevas: string[],
): Promise<{ etiquetas: string[] } | { error: string }> {
  const { data: actual } = await supabase.from("dropshippers").select("etiquetas").eq("id", id).maybeSingle();
  if (!actual) return { error: "No se encontró el dropshipper." };
  const previas = (actual.etiquetas as string[] | null) ?? [];
  if (previas.join("\n") === nuevas.join("\n")) return { etiquetas: nuevas };
  const { error } = await supabase.from("dropshippers").update({ etiquetas: nuevas }).eq("id", id);
  if (error) return { error: "No se pudieron guardar las etiquetas." };
  await registrarAuditoria({
    accion: "etiquetas_dropshipper",
    entidad: "dropshippers",
    entidadId: id,
    antes: { Etiquetas: previas.join(", ") || "—" },
    despues: { Etiquetas: nuevas.join(", ") || "—" },
  });
  return { etiquetas: nuevas };
}
