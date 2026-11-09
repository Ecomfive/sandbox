import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Descontinuado por país (31 oct 2026, pedido de Hernán; migración 0211): los países donde un producto ya no se trae, aunque en los demás siga
 * Activo. «Descontinuado» en el estado del producto vale para todos. Sin la migración, ningún producto está descontinuado en un país.
 *
 * **Un compuesto hereda el de sus simples** (8 nov 2026, pedido de Alcides): un pack o combo está descontinuado en cada país donde lo está alguno de
 * sus componentes. No se guarda: se calcula al leer (`conCompuestos`), así al quitarle la marca al simple el compuesto vuelve solo.
 */

export interface Componente {
  combo_id: string;
  componente_id: string;
}

/** Suma a lo marcado los compuestos: cada uno toma los países de sus componentes. Lógica pura, con prueba. */
export function conCompuestos(directos: ReadonlyMap<string, ReadonlySet<string>>, componentes: readonly Componente[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>([...directos].map(([k, v]) => [k, new Set(v)]));
  for (const c of componentes) {
    const paises = directos.get(c.componente_id);
    if (!paises?.size) continue;
    const set = out.get(c.combo_id) ?? new Set<string>();
    for (const p of paises) set.add(p);
    out.set(c.combo_id, set);
  }
  return out;
}

/** Los componentes de todos los compuestos (sin la tabla, ninguno). */
export async function leerComponentes(supabase: SupabaseClient): Promise<Componente[]> {
  const out: Componente[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id").order("combo_id").order("componente_id").range(desde, desde + 999);
    if (error) return out;
    out.push(...((data ?? []) as Componente[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Por producto, los ids de los países donde está descontinuado. */
export async function descontinuadosPorPais(supabase: SupabaseClient, skuIds: string[]): Promise<Map<string, Set<string>>> {
  // Los componentes de los compuestos pedidos también, para que hereden.
  const { data: comps } = skuIds.length ? await supabase.from("sku_maestro_componentes").select("combo_id, componente_id").in("combo_id", skuIds.slice(0, 1000)) : { data: [] };
  const componentes = (comps ?? []) as Componente[];
  const ids = [...new Set([...skuIds, ...componentes.map((c) => c.componente_id)])];
  const porSku = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("skus_descontinuado_pais").select("sku_id, pais_id").in("sku_id", ids.slice(i, i + 200));
    if (error) return porSku;
    for (const f of data ?? []) {
      const set = porSku.get(f.sku_id as string) ?? new Set<string>();
      set.add(f.pais_id as string);
      porSku.set(f.sku_id as string, set);
    }
  }
  return conCompuestos(porSku, componentes);
}

/** Los productos descontinuados en un país (para marcar la lista de ese país). */
export async function descontinuadosEnPais(supabase: SupabaseClient, paisId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("skus_descontinuado_pais").select("sku_id").eq("pais_id", paisId);
  if (error || !data?.length) return new Set();
  const directos = new Map(data.map((f) => [f.sku_id as string, new Set([paisId])]));
  return new Set(conCompuestos(directos, await leerComponentes(supabase)).keys());
}

/** Si el producto está descontinuado en ese país, el nombre del país; si no, null. */
export async function descontinuadoEn(supabase: SupabaseClient, skuId: string, paisId: string | null): Promise<string | null> {
  if (!paisId) return null;
  // Un compuesto lo está si lo está alguno de sus componentes.
  const { data: comps } = await supabase.from("sku_maestro_componentes").select("componente_id").eq("combo_id", skuId);
  const ids = [skuId, ...(comps ?? []).map((c) => c.componente_id as string)];
  const { data, error } = await supabase.from("skus_descontinuado_pais").select("paises(nombre)").in("sku_id", ids).eq("pais_id", paisId).limit(1).maybeSingle();
  if (error || !data) return null;
  const pais = data.paises as { nombre: string } | { nombre: string }[] | null;
  return (Array.isArray(pais) ? pais[0]?.nombre : pais?.nombre) ?? "este país";
}

/** Por qué un compuesto está descontinuado en cada país: los componentes que lo están (para su ficha). */
export async function descontinuadoHeredado(supabase: SupabaseClient, comboId: string): Promise<{ pais: string; codigo: string; componentes: string[] }[]> {
  const { data: comps } = await supabase.from("sku_maestro_componentes").select("componente_id, skus_maestros!sku_maestro_componentes_componente_id_fkey(nombre)").eq("combo_id", comboId);
  const nombre = new Map(
    (comps ?? []).map((c) => {
      const s = c.skus_maestros as { nombre: string } | { nombre: string }[] | null;
      return [c.componente_id as string, (Array.isArray(s) ? s[0]?.nombre : s?.nombre) ?? "Componente"];
    }),
  );
  if (!nombre.size) return [];
  const { data, error } = await supabase.from("skus_descontinuado_pais").select("sku_id, paises(codigo, nombre)").in("sku_id", [...nombre.keys()]);
  if (error) return [];
  const porPais = new Map<string, { pais: string; codigo: string; componentes: string[] }>();
  for (const f of data ?? []) {
    const p = f.paises as { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null;
    const pais = Array.isArray(p) ? p[0] : p;
    if (!pais) continue;
    const x = porPais.get(pais.codigo) ?? { pais: pais.nombre, codigo: pais.codigo, componentes: [] };
    x.componentes.push(nombre.get(f.sku_id as string) ?? "Componente");
    porPais.set(pais.codigo, x);
  }
  return [...porPais.values()].sort((a, b) => a.pais.localeCompare(b.pais, "es"));
}
