// Anuncios Meta › los resultados por día de todo el historial, con lo que hace falta para agruparlos (producto, ángulo, gancho…): la base sobre la que corren los análisis a pedido y las vigilancias (`analisis-pedido.ts`).
// Es pesado (decenas de miles de filas), así que se guarda 5 minutos por país y cuenta: no es de nadie en particular. Solo lee; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";
import { familiaDeProducto } from "@/lib/publicaciones/ia/fotos-base";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { BaseDias, CampanaBase, VideoBase } from "./analisis-pedido";
import { CPA_TOPE_PREDETERMINADO, sinResultados, type Resultados } from "./metricas";
import { claveDeProducto } from "./nombre";

const num = (v: unknown) => Number(v ?? 0) || 0;

async function leerBase(o: { paisId: string; cuentaId: string | null }, supabase: SupabaseClient): Promise<BaseDias | null> {
  const { data: filasCuentas, error } = await supabase.from("meta_cuentas").select("id, activa").eq("pais_id", o.paisId);
  if (error) return null;
  const ids = (filasCuentas ?? []).filter((c) => (o.cuentaId ? c.id === o.cuentaId : c.activa !== false)).map((c) => c.id as string);
  if (!ids.length) return null;
  const [camp, anun, dia, analisis, topesF] = await Promise.all([
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_campanas").select("id, nombre, estado, estructura, puja, producto, etapa").in("cuenta_id", ids).order("id").range(a, b)),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_anuncios").select("id, campana_id, video_id, nombre, titulo").in("cuenta_id", ids).order("id").range(a, b)),
    traerTodasLasFilas<Record<string, unknown>>((a, b) =>
      supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, vio_landing, compras, valor").in("cuenta_id", ids).order("fecha").order("anuncio_id").range(a, b),
    ),
    // Sin la migración 0357 no hay detalle del ángulo, sin la 0338 no hay tipo de gancho, sin la 0326 no hay tipo de llamado: cada una cae a lo de antes.
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, angulo_detalle, gancho_tipo, formato, cta_tipo").order("video_id").range(a, b)).catch(() =>
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, gancho_tipo, formato, cta_tipo").order("video_id").range(a, b)).catch(() =>
        traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, formato").order("video_id").range(a, b)).catch((): Record<string, unknown>[] => []),
      ),
    ),
    supabase.from("meta_topes").select("producto_clave, cpa_tope"),
  ]);
  const topePorClave = new Map((topesF.data ?? []).map((t) => [t.producto_clave as string, num(t.cpa_tope)]));
  const analisisDe = new Map(analisis.map((h) => [h.video_id as string, h]));
  const anuncioDe = new Map(anun.map((a) => [a.id as string, a]));

  const campanas = new Map<string, CampanaBase>();
  for (const c of camp) {
    const producto = ((c.producto as string | null) ?? "").trim() || null;
    campanas.set(c.id as string, {
      id: c.id as string,
      nombre: c.nombre as string,
      producto,
      familia: familiaDeProducto(producto ?? "", null),
      etapa: (c.etapa as string | null) ?? null,
      estructura: (c.estructura as string | null) ?? null,
      puja: (c.puja as string | null) ?? null,
      tope: topePorClave.get(claveDeProducto(producto)) ?? CPA_TOPE_PREDETERMINADO,
    });
  }
  const nombreDeVideo = new Map<string, string>();
  for (const a of anun) {
    const vid = (a.video_id as string | null) ?? "";
    if (vid && !nombreDeVideo.has(vid)) nombreDeVideo.set(vid, String((a.titulo as string | null) || (a.nombre as string | null) || `Video …${vid.slice(-5)}`).slice(0, 80));
  }
  const videos = new Map<string, VideoBase>();
  for (const [id, nombre] of nombreDeVideo) {
    const h = analisisDe.get(id);
    videos.set(id, { id, nombre, angulo: (h?.angulo as string | null) || null, detalle: (h?.angulo_detalle as string | null) || null, gancho: (h?.gancho_tipo as string | null) || null, formato: (h?.formato as string | null) || null, cta: (h?.cta_tipo as string | null) || null });
  }
  const dias = dia.map((f) => {
    const r: Resultados = { ...sinResultados(), gasto: num(f.gasto), impresiones: num(f.impresiones), clics: num(f.clics), video3s: num(f.video_3s), vioLanding: num(f.vio_landing), compras: num(f.compras), valor: num(f.valor) };
    return { fecha: String(f.fecha), campanaId: f.campana_id as string, videoId: ((anuncioDe.get(f.anuncio_id as string)?.video_id as string | null) ?? null) || null, r };
  });
  return { campanas, videos, dias };
}

/** La base de resultados por día de un país (y una cuenta, o todas), guardada 5 minutos. null si no hay cuentas o falta la migración de Anuncios Meta. */
export const cargarBaseDias = conTtl(5 * 60_000, (o: { paisId: string; cuentaId: string | null }) => `${o.paisId}|${o.cuentaId ?? "todas"}`, leerBase, { esValido: (b) => b !== null });
