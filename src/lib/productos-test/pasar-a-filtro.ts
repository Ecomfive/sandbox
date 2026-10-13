import type { SupabaseClient } from "@supabase/supabase-js";

/** Un texto para `ilike` que no trate `%`, `_` ni `\` como comodines. */
const literal = (t: string) => t.replace(/[\\%_]/g, (c) => "\\" + c);
const BUCKET = "wms-productos";
const PREFIJO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

/** Copia la foto del producto a `filtros/<uuid>/` y devuelve su URL pública (o null si no tiene o no se pudo copiar). */
async function copiarFoto(supabase: SupabaseClient, url: string | null | undefined): Promise<string | null> {
  if (!url || !url.startsWith(PREFIJO)) return null;
  const origen = url.slice(PREFIJO.length);
  if (origen.includes("..")) return null;
  const destino = `filtros/${crypto.randomUUID()}/${(origen.split("/").pop() ?? "foto").replace(/[^A-Za-z0-9._-]+/g, "-")}`;
  const { error } = await supabase.storage.from(BUCKET).copy(origen, destino);
  return error ? null : PREFIJO + destino;
}

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Todo producto de Test productos **vinculado** a un producto que está **Activo** en Producto pasa a Filtro de productos
 * (12 oct 2026), en «Cotizar», con su foto y sus métricas del test. No se duplica: si ya hay una fila de ese test (migración
 * 0100) o, sin ella, una del mismo nombre en el mismo país, se deja como está (y se le anota de qué test vino). Se llama al
 * crear o editar un producto en test y al pasar un producto a Activo. Nunca lanza; devuelve cuántos agregó.
 */
export async function pasarTestsAFiltro(supabase: SupabaseClient, por: { testIds?: string[]; skuId?: string }): Promise<number> {
  try {
    let q = supabase
      .from("wms_productos_test")
      .select("id, nombre, pais_id, sku_maestro_id, metrica_oferta, metrica_cpm, metrica_efectividad, metrica_hook_rate, metrica_ctr, metrica_cpa, metrica_gasto, metrica_compras, metrica_cvr, skus_maestros(clase, foto_url)")
      .not("sku_maestro_id", "is", null);
    if (por.testIds) q = q.in("id", por.testIds);
    if (por.skuId) q = q.eq("sku_maestro_id", por.skuId);
    const { data: tests } = await q;
    let agregados = 0;
    for (const t of tests ?? []) {
      const sku = (Array.isArray(t.skus_maestros) ? t.skus_maestros[0] : t.skus_maestros) as { clase: string; foto_url: string | null } | null;
      if (sku?.clase !== "fisico") continue;

      // ¿Ya está? Por el test (con la migración 0100) o por el nombre en el mismo país.
      const porTest = await supabase.from("wms_filtro_productos").select("id").eq("producto_test_id", t.id).limit(1);
      const conColumna = !porTest.error;
      if (porTest.data?.length) continue;
      const { data: porNombre } = await supabase
        .from("wms_filtro_productos")
        .select("id")
        .eq("pais_id", t.pais_id)
        .ilike("nombre", literal(String(t.nombre).trim()))
        .limit(1);
      if (porNombre?.length) {
        if (conColumna) await supabase.from("wms_filtro_productos").update({ producto_test_id: t.id, sku_maestro_id: t.sku_maestro_id }).eq("id", porNombre[0].id).is("producto_test_id", null);
        continue;
      }

      // La foto se COPIA a la carpeta de Filtro (como hace Compras): compartir la del producto hacía que editar o borrar la
      // fila de Filtro borrara la foto del producto, y al revés.
      const fotoFiltro = await copiarFoto(supabase, sku.foto_url);
      const { error } = await supabase.from("wms_filtro_productos").insert({
        pais_id: t.pais_id,
        nombre: t.nombre,
        foto_url: fotoFiltro,
        estado_registro: "cotizar",
        estado: "pendiente",
        prioridad: "normal",
        metrica_oferta: numero(t.metrica_oferta),
        metrica_cpm: numero(t.metrica_cpm),
        metrica_efectividad: numero(t.metrica_efectividad),
        metrica_hook_rate: numero(t.metrica_hook_rate),
        metrica_ctr: numero(t.metrica_ctr),
        metrica_cpa: numero(t.metrica_cpa),
        metrica_gasto: numero(t.metrica_gasto),
        metrica_compras: numero(t.metrica_compras),
        metrica_cvr: numero(t.metrica_cvr),
        comentarios: "Viene de Test productos (vinculado a un producto Activo).",
        ...(conColumna ? { producto_test_id: t.id, sku_maestro_id: t.sku_maestro_id } : {}),
      });
      if (!error) agregados++;
    }
    return agregados;
  } catch {
    return 0;
  }
}
