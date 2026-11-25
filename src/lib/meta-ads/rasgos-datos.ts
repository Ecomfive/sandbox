// Anuncios Meta › qué tienen en común los que funcionaron: lo que toca la base y las páginas (24 nov 2026, pedido de Alcides). Arma, con los últimos 120 días, un registro por anuncio (su video, su texto y su campaña) y uno por página de destino
// (lo que trae y cómo carga, midiéndola de verdad), y los compara con `compararGanadores`. Las páginas se descargan con `descargarConDetalle` (la descarga segura del sistema: solo direcciones públicas, con límite de tamaño y de tiempo), unas pocas por
// vez y se recuerdan 14 días. Solo lee; nunca escribe en Meta ni en las tiendas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { familiaDeProducto } from "@/lib/publicaciones/ia/fotos-base";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { descargarConDetalle } from "@/lib/seguridad/url-externa";
import { landingLimpia } from "./agrupar";
import { CPA_TOPE_PREDETERMINADO, sinResultados, sumar, type Resultados } from "./metricas";
import { claveDeProducto } from "./nombre";
import { claveDeOfertas, claveDePaginasMedidas, leerValorOfertas, type OfertasProducto } from "./diagnostico-concreto";
import { cortarEnPunto } from "./interpretar-ia";
import { claveDeRasgos, compararGanadores, rasgosDeCampana, rasgosDeCopy, rasgosDePagina, rasgosDeVideo, type Entidad, type RasgosDeGanadores } from "./rasgos-ganadores";

const DIAS = 120;
const MAX_PAGINAS_POR_VEZ = 12;
const DIAS_VIGENTE_PAGINA = 14;
const DIAS_VIGENTE_ERROR = 5;
const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;
const claveDePaginas = claveDePaginasMedidas;

interface PaginaGuardada {
  rasgos: string[];
  en: string;
  error?: boolean;
}
type Paginas = Record<string, PaginaGuardada>;

async function leerPaginas(supabase: SupabaseClient, paisId: string): Promise<Paginas> {
  try {
    const { data } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDePaginas(paisId)).maybeSingle();
    const v = data?.valor as { paginas?: Paginas } | null;
    return v?.paginas && typeof v.paginas === "object" ? v.paginas : {};
  } catch {
    return {};
  }
}

/** Lo que prometen los anuncios de cada producto y lo medido de sus páginas, guardado por el último análisis (vacío si todavía no hay). */
export async function leerOfertasGuardadas(supabase: SupabaseClient, paisId: string): Promise<Record<string, OfertasProducto>> {
  try {
    const { data } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeOfertas(paisId)).maybeSingle();
    return leerValorOfertas(data?.valor);
  } catch {
    return {};
  }
}

/** Mide una página: la descarga (con los límites de seguridad), cuánto tardó y cuánto pesa, y la describe. null si no se pudo. */
async function medirPagina(url: string): Promise<string[] | null> {
  const t0 = Date.now();
  const r = await descargarConDetalle(`https://${url}`, 1_500_000, { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; EcomfiveAnalisis/1.0)" }, true);
  if ("error" in r) return null;
  const ms = Date.now() - t0;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(r.bytes);
  return rasgosDePagina(url, { bytes: r.bytes.length, ms, html });
}

/**
 * Calcula, con los últimos 120 días, qué tienen en común los anuncios (CTR y hook) y las páginas (clic a visita y conversión) que funcionaron, y lo deja guardado. Mide hasta 12 páginas nuevas por corrida; las demás entran en la siguiente.
 * Nunca lanza.
 */
export async function rasgosDelDia(supabase: SupabaseClient, o: { paisId: string; hoy: string }): Promise<RasgosDeGanadores[]> {
  try {
    const { data: cuentasF } = await supabase.from("meta_cuentas").select("id, activa").eq("pais_id", o.paisId);
    const ids = (cuentasF ?? []).filter((c) => c.activa !== false).map((c) => c.id as string);
    if (!ids.length) return [];
    const desde = restar(o.hoy, DIAS);
    const [camp, anun, dia, analisis, topesF] = await Promise.all([
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_campanas").select("id, nombre, estructura, puja, producto").in("cuenta_id", ids).order("id").range(a, b)),
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_anuncios").select("id, campana_id, video_id, nombre, titulo, copy, landing").in("cuenta_id", ids).order("id").range(a, b)),
      traerTodasLasFilas<Record<string, unknown>>((a, b) =>
        supabase.from("meta_resultados_dia").select("anuncio_id, fecha, gasto, impresiones, clics, video_3s, vio_landing, compras, valor").in("cuenta_id", ids).gte("fecha", desde).order("fecha").order("anuncio_id").range(a, b),
      ),
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, gancho_tipo, formato, cta_tipo, duracion_s, cta_segundo, oferta, recursos").order("video_id").range(a, b)).catch((): Record<string, unknown>[] => []),
      supabase.from("meta_topes").select("producto_clave, cpa_tope"),
    ]);
    const tope = new Map((topesF.data ?? []).map((t) => [t.producto_clave as string, num(t.cpa_tope)]));
    const campanaDe = new Map(camp.map((c) => [c.id as string, c]));
    const videoDe = new Map(analisis.map((v) => [v.video_id as string, v]));

    // Lo que hizo cada anuncio en los últimos 120 días.
    const porAnuncio = new Map<string, Resultados>();
    for (const f of dia) {
      const r: Resultados = { ...sinResultados(), gasto: num(f.gasto), impresiones: num(f.impresiones), clics: num(f.clics), video3s: num(f.video_3s), vioLanding: num(f.vio_landing), compras: num(f.compras), valor: num(f.valor) };
      porAnuncio.set(f.anuncio_id as string, sumar(porAnuncio.get(f.anuncio_id as string) ?? sinResultados(), r));
    }

    const anuncios: Entidad[] = [];
    const ofertas = new Map<string, { producto: string; anuncios: OfertasProducto["anuncios"] }>();
    const porPagina = new Map<string, { r: Resultados; tope: number; familia: string }>();
    for (const a of anun) {
      const r = porAnuncio.get(a.id as string);
      if (!r || r.gasto <= 0) continue;
      const c = campanaDe.get(a.campana_id as string);
      if (!c) continue;
      const producto = ((c.producto as string | null) ?? "").trim() || null;
      const topeC = tope.get(claveDeProducto(producto)) ?? CPA_TOPE_PREDETERMINADO;
      const familia = familiaDeProducto(producto ?? "", null);
      const v = a.video_id ? videoDe.get(a.video_id as string) : undefined;
      const rasgos = [
        ...rasgosDeCopy(a.copy as string | null, a.titulo as string | null),
        ...rasgosDeVideo(v ? { angulo: (v.angulo as string | null) || null, ganchoTipo: (v.gancho_tipo as string | null) || null, formato: (v.formato as string | null) || null, ctaTipo: (v.cta_tipo as string | null) || null, duracionS: v.duracion_s === null || v.duracion_s === undefined ? null : num(v.duracion_s), ctaSegundo: v.cta_segundo === null || v.cta_segundo === undefined ? null : num(v.cta_segundo), oferta: (v.oferta as string | null) || null, recursos: Array.isArray(v.recursos) ? (v.recursos as unknown[]).map(String) : [] } : null),
        ...rasgosDeCampana({ estructura: (c.estructura as string | null) ?? null, puja: (c.puja as string | null) ?? null, familia }),
      ];
      anuncios.push({ id: a.id as string, nombre: String((a.titulo as string | null) || (a.nombre as string | null) || "Anuncio").slice(0, 70), rasgos, r, tope: topeC });
      const pag = landingLimpia(a.landing as string | null);
      // La promesa de cada anuncio y adónde lleva, por producto: es lo que usa el «Qué hacer» de los hallazgos de entrega.
      const inicio = cortarEnPunto(String((a.copy as string | null) ?? (a.titulo as string | null) ?? "").replace(/\s+/g, " ").trim(), 170);
      if (producto && inicio && r.gasto >= 30) {
        const clave = claveDeProducto(producto);
        const oferta = ofertas.get(clave) ?? { producto, anuncios: [] };
        oferta.anuncios.push({ titulo: (a.titulo as string | null) ?? null, inicio, landing: pag, gasto: Math.round(r.gasto), compras: r.compras });
        ofertas.set(clave, oferta);
      }
      if (pag) {
        const e = porPagina.get(pag) ?? { r: sinResultados(), tope: topeC, familia };
        e.r = sumar(e.r, r);
        porPagina.set(pag, e);
      }
    }

    // Las páginas con gasto suficiente se miden (unas pocas por vez) y se recuerdan.
    const paginas = await leerPaginas(supabase, o.paisId);
    const pendientes = [...porPagina].filter(([, e]) => e.r.gasto >= 50).sort((a, b) => b[1].r.gasto - a[1].r.gasto).map(([url]) => url).filter((url) => {
      const g = paginas[url];
      if (!g) return true;
      return (Date.now() - Date.parse(g.en)) / 86_400_000 > (g.error ? DIAS_VIGENTE_ERROR : DIAS_VIGENTE_PAGINA);
    }).slice(0, MAX_PAGINAS_POR_VEZ);
    for (let i = 0; i < pendientes.length; i += 3) {
      const lote = pendientes.slice(i, i + 3);
      const medidas = await Promise.all(lote.map((u) => medirPagina(u).catch(() => null)));
      lote.forEach((u, k) => {
        paginas[u] = medidas[k] ? { rasgos: medidas[k]!, en: new Date().toISOString() } : { rasgos: [], en: new Date().toISOString(), error: true };
      });
    }
    if (pendientes.length) await supabase.from("meta_ajustes").upsert({ clave: claveDePaginas(o.paisId), valor: { paginas }, actualizado_por_nombre: "Sistema", actualizado_en: new Date().toISOString() }, { onConflict: "clave" });

    const productosOfertas: Record<string, OfertasProducto> = {};
    for (const [clave, oferta] of ofertas) {
      const top = oferta.anuncios.sort((x, y) => y.gasto - x.gasto).slice(0, 3);
      const medidas: Record<string, string[]> = {};
      for (const a of top) if (a.landing && paginas[a.landing] && !paginas[a.landing].error && paginas[a.landing].rasgos.length) medidas[a.landing] = paginas[a.landing].rasgos;
      productosOfertas[clave] = { producto: oferta.producto, anuncios: top, paginas: medidas };
    }
    await supabase.from("meta_ajustes").upsert({ clave: claveDeOfertas(o.paisId), valor: { generadoEn: new Date().toISOString(), productos: productosOfertas }, actualizado_por_nombre: "Sistema", actualizado_en: new Date().toISOString() }, { onConflict: "clave" });

    const entidadesPagina: Entidad[] = [...porPagina]
      .filter(([url]) => (paginas[url]?.rasgos.length ?? 0) > 0)
      .map(([url, e]) => ({ id: url, nombre: url, rasgos: [...paginas[url].rasgos, `Tipo de producto: ${e.familia}`], r: e.r, tope: e.tope }));

    const items = [compararGanadores(anuncios, "ctr"), compararGanadores(anuncios, "hook"), compararGanadores(entidadesPagina, "clic_a_visita"), compararGanadores(entidadesPagina, "cvr")].filter((x): x is RasgosDeGanadores => x !== null);
    await supabase.from("meta_ajustes").upsert({ clave: claveDeRasgos(o.paisId), valor: { generadoEn: new Date().toISOString(), items }, actualizado_por_nombre: "Sistema", actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    return items;
  } catch {
    return [];
  }
}
