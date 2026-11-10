// Carga lo necesario para sugerir el producto (SKU) de las publicaciones sin vincular y arma cada sugerencia (la usa la página
// de Gestión de IDs Dropi). Las reglas están en `vincular.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { prepararContexto, sugerirSku, type Sugerencia } from "./vincular";

export interface SkuResumen {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  tipo: string;
  /** El N.º correlativo y el código de barras del producto (7 nov 2026, pedido de Hernán). */
  numero?: number | null;
  barras?: string | null;
}

export interface SugerenciaVista extends Omit<Sugerencia, "skuId" | "alternativas"> {
  sku: SkuResumen | null;
  alternativas: SkuResumen[];
}

/**
 * Los productos de Producto (para mostrar el vinculado) y, para cada publicación sin vincular, su sugerencia. Sin la migración
 * 0117 (huella de la foto) sugiere solo por nombre.
 */
export async function cargarSugerencias(
  supabase: SupabaseClient,
  paisId: string,
  publicaciones: { id: string; nombre: string; dropiId: string; skuId: string | null }[],
): Promise<{ skus: Map<string, SkuResumen>; sugerencias: Map<string, SugerenciaVista>; combosX2: Map<string, { id: string; codigo: string }> }> {
  const [skusR, comps, catalogoR, huellasR] = await Promise.all([
    traerTodasLasFilas<{ id: string; codigo: string; nombre: string; tipo: string; foto_url: string | null; foto_huella: string | null; numero: number | null; codigo_barras: string | null }>((d, h) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_url, foto_huella, numero, codigo_barras").is("padre_id", null).order("id").range(d, h),
    ),
    traerTodasLasFilas<{ combo_id: string; componente_id: string; cantidad: number }>((d, h) =>
      supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("combo_id").order("componente_id").range(d, h),
    ),
    supabase.from("competencia_productos").select("dropi_producto_id, sku, nombre").eq("pais_id", paisId).eq("es_nuestro", true).limit(2000),
    supabase.from("dropi_publicaciones").select("id, foto_huella").eq("pais_id", paisId).not("foto_huella", "is", null).limit(5000),
  ]);
  const skus = new Map<string, SkuResumen>(skusR.map((s) => [s.id, { id: s.id, codigo: s.codigo, nombre: s.nombre, foto: s.foto_url, tipo: s.tipo, numero: s.numero ?? null, barras: s.codigo_barras || null }]));
  // Una publicación vinculada a una variante (10 nov 2026: «Base Magica Zephoco Natural» de Costa Rica, a BASE/MAQUILLAJE/ZEPHOCO/NATURAL): la lista de
  // arriba trae solo los productos sin padre, así que la variante no estaba y la ficha la mostraba sin vincular. Se suman las que falten; no entran en
  // las sugerencias, que siguen proponiendo solo productos.
  const faltan = [...new Set(publicaciones.map((p) => p.skuId).filter((id): id is string => !!id && !skus.has(id)))];
  for (let i = 0; i < faltan.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_url, numero, codigo_barras").in("id", faltan.slice(i, i + 200));
    for (const s of (data ?? []) as { id: string; codigo: string; nombre: string; tipo: string; foto_url: string | null; numero: number | null; codigo_barras: string | null }[])
      skus.set(s.id, { id: s.id, codigo: s.codigo, nombre: s.nombre, foto: s.foto_url, tipo: s.tipo, numero: s.numero ?? null, barras: s.codigo_barras || null });
  }
  const enDropi = new Map((catalogoR.data ?? []).map((c) => [String(c.dropi_producto_id), [c.sku, c.nombre].filter((x): x is string => !!x)]));
  const huella = new Map((huellasR.error ? [] : (huellasR.data ?? [])).map((h) => [h.id as string, h.foto_huella as string]));
  const ctx = prepararContexto(
    skusR.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, huella: s.foto_huella })),
    comps.map((c) => ({ comboId: c.combo_id, componenteId: c.componente_id, cantidad: c.cantidad })),
  );
  const sugerencias = new Map<string, SugerenciaVista>();
  for (const p of publicaciones) {
    if (p.skuId) continue;
    const textosDropi = p.dropiId.split(/[^0-9]+/).flatMap((id) => enDropi.get(id) ?? []);
    const s = sugerirSku({ nombre: p.nombre, huella: huella.get(p.id) ?? null, textosDropi }, ctx);
    const { skuId, alternativas, ...resto } = s;
    sugerencias.set(p.id, { ...resto, sku: skuId ? (skus.get(skuId) ?? null) : null, alternativas: alternativas.map((a) => skus.get(a)).filter((x): x is SkuResumen => !!x) });
  }
  // El compuesto de 2 unidades de cada producto simple (un solo componente con cantidad 2), para las recomendaciones de combo.
  const porCombo = new Map<string, { componenteId: string; cantidad: number }[]>();
  for (const c of comps) porCombo.set(c.combo_id, [...(porCombo.get(c.combo_id) ?? []), { componenteId: c.componente_id, cantidad: Number(c.cantidad) }]);
  const combosX2 = new Map<string, { id: string; codigo: string }>();
  for (const [comboId, cs] of porCombo) {
    const combo = skus.get(comboId);
    if (combo && cs.length === 1 && cs[0].cantidad === 2 && !combosX2.has(cs[0].componenteId)) combosX2.set(cs[0].componenteId, { id: comboId, codigo: combo.codigo });
  }
  return { skus, sugerencias, combosX2 };
}
