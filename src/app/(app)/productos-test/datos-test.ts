import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilaProductoTest } from "./def-productos-test";

const COLUMNAS =
  "id, nombre, sku_maestro_id, skus_maestros(foto_url), fecha_creacion, fuente, pagina_producto_url, video_url, categoria, angulo_venta, worldwide, ad_library, fecha_test, estado, clickup, test_numero, calculadora_url, campana_url, metrica_oferta, metrica_cpm, metrica_efectividad, metrica_hook_rate, metrica_ctr, metrica_cpa, metrica_gasto, metrica_compras, metrica_cvr, revisado, ultima_revision, observacion, explotacion, creado_en";

const numero = (v: string | number | null) => (v === null ? null : Number(v));

/** Los productos en test de un país, con sus métricas ya como números. Lo comparten el informe y la lista. */
export async function obtenerProductosTest(supabase: SupabaseClient, paisId: string): Promise<FilaProductoTest[]> {
  const { data } = await supabase
    .from("wms_productos_test")
    .select(COLUMNAS)
    .eq("pais_id", paisId)
    .order("creado_en", { ascending: false })
    .limit(1000);
  // Sin producto vinculado (o sin foto), la foto de Filtro de productos con el mismo nombre en el país.
  const { data: filtros } = await supabase.from("wms_filtro_productos").select("nombre, foto_url").eq("pais_id", paisId).not("foto_url", "is", null);
  const fotoFiltro = new Map((filtros ?? []).map((f) => [String(f.nombre).toLowerCase().trim(), f.foto_url as string]));
  const fotoDe = (p: { nombre: string; skus_maestros?: unknown }) => {
    const sku = (Array.isArray(p.skus_maestros) ? p.skus_maestros[0] : p.skus_maestros) as { foto_url: string | null } | null | undefined;
    return sku?.foto_url ?? fotoFiltro.get(p.nombre.toLowerCase().trim()) ?? null;
  };

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    skuMaestroId: (p as { sku_maestro_id?: string | null }).sku_maestro_id ?? null,
    fotoUrl: fotoDe(p),
    fechaCreacion: p.fecha_creacion,
    fuente: p.fuente,
    paginaProductoUrl: p.pagina_producto_url,
    videoUrl: p.video_url,
    categoria: p.categoria,
    anguloVenta: p.angulo_venta,
    worldwide: p.worldwide,
    adLibrary: p.ad_library,
    fechaTest: p.fecha_test,
    estado: p.estado,
    clickup: p.clickup,
    testNumero: p.test_numero,
    calculadoraUrl: p.calculadora_url,
    campanaUrl: p.campana_url,
    metricaOferta: numero(p.metrica_oferta),
    metricaCpm: numero(p.metrica_cpm),
    metricaEfectividad: numero(p.metrica_efectividad),
    metricaHookRate: numero(p.metrica_hook_rate),
    metricaCtr: numero(p.metrica_ctr),
    metricaCpa: numero(p.metrica_cpa),
    metricaGasto: numero(p.metrica_gasto),
    metricaCompras: numero(p.metrica_compras),
    metricaCvr: numero(p.metrica_cvr),
    revisado: p.revisado,
    ultimaRevision: p.ultima_revision,
    observacion: p.observacion,
    explotacion: p.explotacion,
    creadoEn: p.creado_en,
  }));
}

/**
 * Los productos de Producto para elegir el de un producto en prueba (el mismo buscador de la orden de compra: foto, SKU, nombre y
 * N.º). Sin los compuestos ni los productos padre con variantes.
 */
export async function obtenerOpcionesProducto(supabase: SupabaseClient): Promise<{ id: string; codigo: string; nombre: string; estado: string; numero: number | null; foto: string | null }[]> {
  const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, clase, tipo, padre_id, numero, foto_url").neq("tipo", "combo").order("nombre");
  const filas = data ?? [];
  const padres = new Set(filas.filter((p) => p.padre_id).map((p) => p.padre_id as string));
  return filas
    .filter((p) => !padres.has(p.id as string))
    .map((p) => ({
      id: p.id as string,
      codigo: p.codigo as string,
      nombre: p.nombre as string,
      estado: p.clase === "test" ? "test" : "aprobado",
      numero: (p.numero as number | null) ?? null,
      foto: (p.foto_url as string | null) ?? null,
    }));
}
