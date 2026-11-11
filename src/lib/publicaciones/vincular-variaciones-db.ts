// Gestión de IDs Dropi › vincula solas las variaciones de Dropi con las variantes de Producto (9 nov 2026; migración 0261). Para cada publicación vinculada a un producto
// con variantes, toma las variaciones de la última lectura de cada uno de sus IDs (`dropi_productos_proveedor.variaciones`) y las empareja (`emparejarVariacion`).
// Solo agrega lo que falta: un vínculo que ya existe —sobre todo uno elegido a mano— no se toca. Lo llaman la lectura de «Mis productos» y
// scripts/vincular-variaciones-dropi.ts. Sin la migración no hace nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { idsDeDropi } from "./sincronizar-dropi";
import { claveVariacion, emparejarVariacion, type VarianteNuestra } from "./vincular-variaciones";

export interface ResultadoVincularVariaciones {
  variaciones: number;
  yaVinculadas: number;
  nuevas: number;
  /** Las que no se pudieron emparejar: ninguna variante calza o calza más de una. */
  sinPareja: { publicacion: string; dropiId: number; etiqueta: string }[];
}

export async function autoVincularVariaciones(supabase: SupabaseClient, opciones: { paisId?: string; aplicar?: boolean } = {}): Promise<ResultadoVincularVariaciones | null> {
  const aplicar = opciones.aplicar ?? true;
  const existentes = await supabase.from("dropi_variaciones_vinculo").select("pais_id, dropi_producto_id, firma").limit(20000);
  if (existentes.error) return null; // Sin la migración 0261.
  const ya = new Set((existentes.data ?? []).map((v) => `${v.pais_id}|${claveVariacion(Number(v.dropi_producto_id), v.firma)}`));

  const variantes = await traerTodasLasFilas<VarianteNuestra & { padre_id: string }>((d, h) =>
    supabase.from("skus_maestros").select("id, codigo, opciones, padre_id").not("padre_id", "is", null).order("id").range(d, h),
  );
  const porPadre = new Map<string, VarianteNuestra[]>();
  for (const v of variantes) porPadre.set(v.padre_id, [...(porPadre.get(v.padre_id) ?? []), v]);
  if (!porPadre.size) return { variaciones: 0, yaVinculadas: 0, nuevas: 0, sinPareja: [] };

  let q = supabase.from("dropi_publicaciones").select("pais_id, nombre, dropi_id, sku_maestro_id").in("sku_maestro_id", [...porPadre.keys()]).not("dropi_id", "is", null);
  if (opciones.paisId) q = q.eq("pais_id", opciones.paisId);
  const { data: publicaciones } = await q;
  const ids = [...new Set((publicaciones ?? []).flatMap((p) => idsDeDropi(p.dropi_id as string | null)))];
  if (!ids.length) return { variaciones: 0, yaVinculadas: 0, nuevas: 0, sinPareja: [] };
  const { data: productos } = await supabase.from("dropi_productos_proveedor").select("pais_id, dropi_producto_id, variaciones").in("dropi_producto_id", ids);
  const variacionesDe = new Map((productos ?? []).map((p) => [`${p.pais_id}|${p.dropi_producto_id}`, p.variaciones as { firma: string; etiqueta: string; sku: string | null }[] | null]));

  const resultado: ResultadoVincularVariaciones = { variaciones: 0, yaVinculadas: 0, nuevas: 0, sinPareja: [] };
  const filas: { pais_id: string; dropi_producto_id: number; firma: string; sku_maestro_id: string; como: string }[] = [];
  const vistas = new Set<string>();
  for (const p of publicaciones ?? []) {
    const nuestras = porPadre.get(p.sku_maestro_id as string) ?? [];
    for (const id of idsDeDropi(p.dropi_id as string | null)) {
      for (const v of variacionesDe.get(`${p.pais_id}|${id}`) ?? []) {
        const clave = `${p.pais_id}|${claveVariacion(id, v.firma)}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        resultado.variaciones++;
        if (ya.has(clave)) {
          resultado.yaVinculadas++;
          continue;
        }
        const sku = emparejarVariacion(v, nuestras);
        if (!sku) {
          resultado.sinPareja.push({ publicacion: p.nombre as string, dropiId: id, etiqueta: v.etiqueta });
          continue;
        }
        filas.push({ pais_id: p.pais_id as string, dropi_producto_id: id, firma: v.firma, sku_maestro_id: sku, como: "auto" });
      }
    }
  }
  resultado.nuevas = filas.length;
  if (aplicar && filas.length) {
    const { error } = await supabase.from("dropi_variaciones_vinculo").upsert(filas, { onConflict: "pais_id,dropi_producto_id,firma", ignoreDuplicates: true });
    if (error) throw new Error(`Vincular variaciones: ${error.message}`);
  }
  return resultado;
}

/** Las variantes de cada producto principal (para elegir) y a qué variante va cada variación de Dropi del país, por ID de Dropi. Sin la migración, sin vínculos. */
export async function cargarVariantesYVinculos(
  supabase: SupabaseClient,
  paisId: string,
): Promise<{ variantesDe: Map<string, { id: string; codigo: string; etiqueta: string }[]>; vinculosDe: Map<number, [string, string][]> }> {
  const [variantes, vinculos] = await Promise.all([
    traerTodasLasFilas<VarianteNuestra & { padre_id: string }>((d, h) => supabase.from("skus_maestros").select("id, codigo, opciones, padre_id").not("padre_id", "is", null).order("id").range(d, h)),
    supabase.from("dropi_variaciones_vinculo").select("dropi_producto_id, firma, sku_maestro_id").eq("pais_id", paisId).limit(20000),
  ]);
  const variantesDe = new Map<string, { id: string; codigo: string; etiqueta: string }[]>();
  for (const v of variantes) {
    const etiqueta = Object.values(v.opciones ?? {}).map(String).filter(Boolean).join(" / ") || v.codigo;
    variantesDe.set(v.padre_id, [...(variantesDe.get(v.padre_id) ?? []), { id: v.id, codigo: v.codigo, etiqueta }]);
  }
  const vinculosDe = new Map<number, [string, string][]>();
  for (const v of vinculos.error ? [] : (vinculos.data ?? [])) {
    const id = Number(v.dropi_producto_id);
    vinculosDe.set(id, [...(vinculosDe.get(id) ?? []), [claveVariacion(id, v.firma), v.sku_maestro_id as string]]);
  }
  return { variantesDe, vinculosDe };
}
