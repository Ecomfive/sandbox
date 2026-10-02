import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilaProductoTest } from "./def-productos-test";

const COLUMNAS =
  "id, nombre, fecha_creacion, fuente, pagina_producto_url, video_url, categoria, angulo_venta, worldwide, ad_library, fecha_test, estado, clickup, test_numero, calculadora_url, campana_url, metrica_oferta, metrica_cpm, metrica_efectividad, metrica_hook_rate, metrica_ctr, metrica_cpa, metrica_gasto, metrica_compras, metrica_cvr, revisado, ultima_revision, observacion, explotacion, creado_en";

const numero = (v: string | number | null) => (v === null ? null : Number(v));

/** Los productos en test de un país, con sus métricas ya como números. Lo comparten el informe y la lista. */
export async function obtenerProductosTest(supabase: SupabaseClient, paisId: string): Promise<FilaProductoTest[]> {
  const { data } = await supabase
    .from("wms_productos_test")
    .select(COLUMNAS)
    .eq("pais_id", paisId)
    .order("creado_en", { ascending: false })
    .limit(1000);

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
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
