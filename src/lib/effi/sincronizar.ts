import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreComparable } from "@/lib/publicaciones-drop/lectura";
import { prepararContexto, sugerirSku, type Sugerencia } from "@/lib/publicaciones/vincular";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { consultarTodoEffi } from "./api";
import { articulosDeLectura, type ArticuloEffi } from "./articulos";

/** Effi es de la cuenta de Costa Rica. */
export const PAIS_DE_EFFI = "CR";

export interface ResumenLecturaEffi {
  articulos: number;
  nuevos: number;
  yaNoEstan: number;
  vinculados: number;
}

const revisar = <T,>(r: { data: T; error: { message: string } | null }, que: string): T => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

/**
 * Lee los artículos de Effi por la API y los guarda en `effi_publicaciones` (5 nov 2026). Lo que ya no aparece queda con `en_effi = false` (nada se borra) y una
 * lectura vacía no toca nada. **No vincula** el producto: solo deja la sugerencia de lo que no está vinculado, con el mismo orden que Drop: una publicación de
 * Dropi del país con el mismo nombre o referencia y, si no, `sugerirSku` por nombre (Effi todavía no da huella de foto). Solo escribe en la base, nunca en Effi.
 */
export async function sincronizarEffi(supabase: SupabaseClient): Promise<ResumenLecturaEffi> {
  const lectura = await consultarTodoEffi("articulo");
  if (!lectura.ok) throw new Error(lectura.error);
  const vistos = articulosDeLectura(lectura.data);
  if (!vistos.length) throw new Error("Effi no devolvió ningún artículo: no se tocó nada.");

  const pais = revisar(await supabase.from("paises").select("id").eq("codigo", PAIS_DE_EFFI).maybeSingle(), "País");
  if (!pais) throw new Error("Falta Costa Rica en Configuración › Países.");

  const antes = await traerTodasLasFilas<{ id: string; effi_id: string; sku_maestro_id: string | null; en_effi: boolean }>((d, h) =>
    supabase.from("effi_publicaciones").select("id, effi_id, sku_maestro_id, en_effi").eq("pais_id", pais.id).order("id").range(d, h),
  );
  const porId = new Map(antes.map((a) => [a.effi_id, a]));

  const sinVincular = vistos.filter((v) => !porId.get(v.effiId)?.sku_maestro_id);
  const sugerencias = new Map<string, Sugerencia>();
  if (sinVincular.length) {
    const [dropi, skus, comps] = await Promise.all([
      traerTodasLasFilas<{ nombre: string; sku_maestro_id: string | null }>((d, h) =>
        supabase.from("dropi_publicaciones").select("nombre, sku_maestro_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h),
      ),
      traerTodasLasFilas<{ id: string; codigo: string; nombre: string; tipo: string; foto_huella: string | null }>((d, h) =>
        supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_huella").is("padre_id", null).order("id").range(d, h),
      ),
      traerTodasLasFilas<{ combo_id: string; componente_id: string; cantidad: number }>((d, h) =>
        supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("combo_id").order("componente_id").range(d, h),
      ),
    ]);
    const porNombreDropi = new Map<string, Set<string>>();
    for (const p of dropi) {
      const k = nombreComparable(p.nombre);
      if (k && p.sku_maestro_id) porNombreDropi.set(k, (porNombreDropi.get(k) ?? new Set()).add(p.sku_maestro_id));
    }
    const ctx = prepararContexto(
      skus.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, huella: s.foto_huella })),
      comps.map((c) => ({ comboId: c.combo_id, componenteId: c.componente_id, cantidad: c.cantidad })),
    );
    for (const v of sinVincular) {
      const enDropi = [...new Set([v.nombre, v.referencia ?? ""].map(nombreComparable).flatMap((k) => [...(porNombreDropi.get(k) ?? [])]))];
      sugerencias.set(
        v.effiId,
        enDropi.length === 1
          ? { tipo: "seguro", skuId: enDropi[0], metodo: "nombre", parecido: 1, alternativas: [], pack: null }
          : sugerirSku({ nombre: v.nombre, huella: null, textosDropi: v.referencia ? [v.referencia] : [] }, ctx),
      );
    }
  }

  const ahora = new Date().toISOString();
  const fila = (v: ArticuloEffi) => {
    const s = sugerencias.get(v.effiId);
    return {
      pais_id: pais.id,
      effi_id: v.effiId,
      nombre: v.nombre,
      referencia: v.referencia,
      gtin: v.gtin,
      categoria: v.categoria,
      foto_url: v.fotoUrl,
      precio_dropshipping: v.precioDropshipping,
      precio_sugerido: v.precioSugerido,
      precio_minimo: v.precioMinimo,
      costo: v.costo,
      stock_principal: v.stockPrincipal,
      stock_garantias: v.stockGarantias,
      compartido: v.compartido,
      en_effi: true,
      sugerido_sku_id: s?.skuId ?? null,
      sugerencia: s ? s.tipo : null,
      ultima_vez: ahora,
      actualizado_en: ahora,
    };
  };
  const filas = vistos.map(fila);
  for (let i = 0; i < filas.length; i += 200) revisar(await supabase.from("effi_publicaciones").upsert(filas.slice(i, i + 200), { onConflict: "pais_id,effi_id" }), "Guardar los artículos de Effi");

  const vistosIds = new Set(vistos.map((v) => v.effiId));
  const yaNoEstan = antes.filter((a) => a.en_effi && !vistosIds.has(a.effi_id));
  if (yaNoEstan.length)
    revisar(await supabase.from("effi_publicaciones").update({ en_effi: false, actualizado_en: ahora }).in("id", yaNoEstan.map((a) => a.id)), "Marcar los que ya no están en Effi");

  return { articulos: vistos.length, nuevos: vistos.filter((v) => !porId.has(v.effiId)).length, yaNoEstan: yaNoEstan.length, vinculados: vistos.length - sinVincular.length };
}
