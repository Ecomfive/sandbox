import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "@/lib/crm/telefono";

/**
 * El país del chat, para saber qué viene en camino: el del dropshipper vinculado (o el de su primera cuenta de Dropi) y, si no está en el
 * CRM, el del prefijo de su número (+507 → Panamá).
 */
export async function paisDelChat(supabase: SupabaseClient, telefono: string, dropshipperId: string | null): Promise<{ id: string; nombre: string } | null> {
  const paises = ((await supabase.from("paises").select("id, codigo, nombre")).data ?? []) as { id: string; codigo: string; nombre: string }[];
  if (dropshipperId) {
    const { data } = await supabase.from("dropshippers").select("pais_id, dropshipper_cuentas(pais_id)").eq("id", dropshipperId).maybeSingle();
    const cuentas = (data?.dropshipper_cuentas ?? []) as { pais_id: string | null }[];
    const id = (data?.pais_id as string | null) ?? cuentas.find((c) => c.pais_id)?.pais_id ?? null;
    const p = paises.find((x) => x.id === id);
    if (p) return { id: p.id, nombre: p.nombre };
  }
  const codigo = normalizarTelefono(telefono)?.pais;
  const p = paises.find((x) => x.codigo === codigo);
  return p ? { id: p.id, nombre: p.nombre } : null;
}
