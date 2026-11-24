// Anuncios Meta › Hallazgos: lo que toca la base (24 nov 2026). Lee **todo el historial** de las cuentas del país (resultados por día de campañas y anuncios, análisis de los videos y los pedidos de las tiendas para saber qué se entrega)
// y arma la entrada de `historico.ts`. Es pesado (decenas de miles de filas), así que se guarda 10 minutos por país y cuenta: no es de nadie en particular. Solo lee; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { familiaDeProducto } from "@/lib/publicaciones/ia/fotos-base";
import { conTtl } from "@/lib/cache-ttl";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { anguloDominante, composicionDeAngulos } from "./atributos-video";
import { indexarCatalogo, palabrasDeProducto, type IndiceCatalogo } from "./etapa-venta";
import { analizarHistorico, sinVentanas, type AnalisisHistorico, type CampanaHist, type EntregaProducto, type ProductoHist, type VideoHist, type Ventanas } from "./historico";
import { CPA_TOPE_PREDETERMINADO, sinResultados, sumar, type Resultados } from "./metricas";
import { claveDeProducto } from "./nombre";

/** Cuántos días hacia atrás se miran los pedidos para la tasa de entrega: lo de hace más de medio año ya no dice cómo está hoy el producto. */
export const DIAS_DE_ENTREGA = 180;

const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

interface FilaDia {
  anuncio_id: string;
  campana_id: string;
  fecha: string;
  gasto: unknown;
  impresiones: unknown;
  clics: unknown;
  video_3s: unknown;
  vio_landing: unknown;
  compras: unknown;
  valor: unknown;
}
const resultadosDe = (f: FilaDia): Resultados => ({ ...sinResultados(), gasto: num(f.gasto), impresiones: num(f.impresiones), clics: num(f.clics), video3s: num(f.video_3s), vioLanding: num(f.vio_landing), compras: num(f.compras), valor: num(f.valor) });

export interface HistoricoCargado {
  analisis: AnalisisHistorico;
  /** Las tiendas cuyos pedidos se usaron para la tasa de entrega (vacío = no se encontraron pedidos). */
  tiendas: string[];
  /** Los pedidos que se miraron para la tasa de entrega. */
  pedidos: number;
  /** Falta la migración de Anuncios Meta o no hay cuentas. */
  vacio: boolean;
}

/**
 * El producto de la tienda (el nombre de la línea del pedido) que es el de una campaña, o null. Las campañas se llaman «META SUPLEMENTO NAD SELERB» o «EO SHILAJIT» y en la tienda el producto es «NAD+ Selerb» o «Shilajit Ultra»,
 * así que la regla es más suelta que la de la etapa: al menos el 60 % de las palabras de la campaña (sin «META», «EO»…) tienen que estar en el nombre y alguna de 4 letras o más; gana el que cubre más palabras y, a igual, el
 * de nombre más corto. Es aproximado: la tabla de entrega dice con qué producto de la tienda se calculó, para que se pueda revisar.
 */
export function productoEnVentas(nombre: string | null | undefined, indice: IndiceCatalogo): string | null {
  const buscadas = palabrasDeProducto(nombre ?? "").filter((p) => p !== "meta");
  if (!buscadas.length) return null;
  const igual = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
  let mejor: { nombre: string; cobertura: number; largo: number } | null = null;
  for (const p of indice.productos) {
    const aciertos = buscadas.filter((b) => p.palabras.some((q) => igual(b, q)));
    if (!aciertos.some((w) => w.length >= 4) || aciertos.length / buscadas.length < 0.6) continue;
    const cobertura = aciertos.length / buscadas.length;
    if (!mejor || cobertura > mejor.cobertura || (cobertura === mejor.cobertura && p.palabras.length < mejor.largo)) mejor = { nombre: p.nombre, cobertura, largo: p.palabras.length };
  }
  return mejor?.nombre ?? null;
}

/** Las unidades (tiendas) de Finanzas que son las de las cuentas publicitarias: por el nombre de la tienda de cada cuenta. Sin tiendas anotadas, todas. */
export function unidadesDeTiendas(unidades: { id: string; nombre: string }[], tiendas: string[]): { id: string; nombre: string }[] {
  const buscadas = tiendas.map((t) => sinTildes(t).trim()).filter(Boolean);
  if (!buscadas.length) return [];
  return unidades.filter((u) => buscadas.some((t) => sinTildes(u.nombre).includes(t)));
}

/** Las entregas por producto de los pedidos: unidades entregadas, devueltas, canceladas y en camino de cada producto (por el nombre de la línea). Los servicios (envío, seguro) no cuentan. */
export function entregasPorProducto(lineas: { producto: string; cantidad: number; estado: string | null; servicio: boolean }[]): Map<string, EntregaProducto> {
  const mapa = new Map<string, EntregaProducto>();
  for (const l of lineas) {
    if (l.servicio || !l.producto) continue;
    const e = mapa.get(l.producto) ?? { nombre: l.producto, entregadas: 0, devueltas: 0, canceladas: 0, enCamino: 0 };
    const n = Math.max(1, num(l.cantidad));
    if (l.estado === "entregada") e.entregadas += n;
    else if (l.estado === "devuelta") e.devueltas += n;
    else if (l.estado === "cancelada" || l.estado === "no_gestionada") e.canceladas += n;
    else if (l.estado === "en_transito" || l.estado === "pendiente") e.enCamino += n;
    mapa.set(l.producto, e);
  }
  return mapa;
}

async function cargar(o: { paisId: string; cuentaId: string | null; hoy: string }, supabase: SupabaseClient): Promise<HistoricoCargado> {
  const vacio: HistoricoCargado = { analisis: analizarHistorico({ campanas: [], videos: [], productos: [], desde: null, hasta: null }), tiendas: [], pedidos: 0, vacio: true };
  const { data: filasCuentas, error } = await supabase.from("meta_cuentas").select("id, tienda, activa").eq("pais_id", o.paisId);
  if (error) return vacio;
  const cuentas = (filasCuentas ?? []).filter((c) => (o.cuentaId ? c.id === o.cuentaId : c.activa !== false));
  const ids = cuentas.map((c) => c.id as string);
  if (!ids.length) return vacio;

  const [camp, anun, dia, analisis, topesF] = await Promise.all([
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_campanas").select("id, nombre, estado, estructura, puja, producto, etapa").in("cuenta_id", ids).order("id").range(a, b)),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_anuncios").select("id, campana_id, video_id, nombre, titulo").in("cuenta_id", ids).order("id").range(a, b)),
    traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, vio_landing, compras, valor").in("cuenta_id", ids).order("fecha").order("anuncio_id").range(a, b)),
    // Sin la migración 0338 no hay tipo de gancho, sin la 0326 no hay tipo de llamado: cada una cae a lo de antes.
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, gancho_tipo, formato, cta_tipo").order("video_id").range(a, b)).catch(() =>
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, angulo, formato").order("video_id").range(a, b)).catch((): Record<string, unknown>[] => []),
    ),
    supabase.from("meta_topes").select("producto_clave, cpa_tope"),
  ]);
  const topePorClave = new Map((topesF.data ?? []).map((t) => [t.producto_clave as string, num(t.cpa_tope)]));
  const topeDe = (clave: string) => topePorClave.get(clave) ?? CPA_TOPE_PREDETERMINADO;
  const hoy = o.hoy;
  const f = { mesDesde: restar(hoy, 29), mesPrevDesde: restar(hoy, 59), semDesde: restar(hoy, 6), semPrevDesde: restar(hoy, 27) };

  const anuncioDe = new Map(anun.map((a) => [a.id as string, a]));
  const analisisDe = new Map(analisis.map((h) => [h.video_id as string, h]));
  const totalCampana = new Map<string, Resultados>();
  const ventCampana = new Map<string, Ventanas>();
  const totalAnuncio = new Map<string, Resultados>();
  const totalVideo = new Map<string, Resultados>();
  let desde: string | null = null;
  let hasta: string | null = null;
  for (const fila of dia) {
    const r = resultadosDe(fila);
    if (!desde || fila.fecha < desde) desde = fila.fecha;
    if (!hasta || fila.fecha > hasta) hasta = fila.fecha;
    totalCampana.set(fila.campana_id, sumar(totalCampana.get(fila.campana_id) ?? sinResultados(), r));
    totalAnuncio.set(fila.anuncio_id, sumar(totalAnuncio.get(fila.anuncio_id) ?? sinResultados(), r));
    const vid = anuncioDe.get(fila.anuncio_id)?.video_id as string | undefined;
    if (vid) totalVideo.set(vid, sumar(totalVideo.get(vid) ?? sinResultados(), r));
    const v = ventCampana.get(fila.campana_id) ?? sinVentanas();
    if (fila.fecha >= f.mesDesde) v.mes.rec = sumar(v.mes.rec, r);
    else if (fila.fecha >= f.mesPrevDesde) v.mes.prev = sumar(v.mes.prev, r);
    if (fila.fecha >= f.semDesde) v.semana.rec = sumar(v.semana.rec, r);
    else if (fila.fecha >= f.semPrevDesde) v.semana.prev = sumar(v.semana.prev, r);
    ventCampana.set(fila.campana_id, v);
  }

  // El ángulo de una campaña es el de sus videos (el que domina); el producto, el que dice su nombre.
  const videosDeCampana = new Map<string, { videoId: string; angulo: string | null; gasto: number }[]>();
  for (const a of anun) {
    const vid = (a.video_id as string | null) ?? "";
    if (!vid) continue;
    const l = videosDeCampana.get(a.campana_id as string) ?? [];
    l.push({ videoId: vid, angulo: (analisisDe.get(vid)?.angulo as string | null) ?? null, gasto: totalAnuncio.get(a.id as string)?.gasto ?? 0 });
    videosDeCampana.set(a.campana_id as string, l);
  }
  const productoDe = new Map<string, { nombre: string | null; clave: string }>();
  const campanas: CampanaHist[] = camp.map((c) => {
    const nombreProducto = ((c.producto as string | null) ?? "").trim() || null;
    const clave = claveDeProducto(nombreProducto);
    productoDe.set(c.id as string, { nombre: nombreProducto, clave });
    return {
      id: c.id as string,
      nombre: c.nombre as string,
      producto: nombreProducto,
      clave,
      familia: familiaDeProducto(nombreProducto ?? "", null),
      activa: c.estado === "ACTIVE",
      etapa: (c.etapa as string | null) ?? null,
      estructura: (c.estructura as string | null) ?? null,
      puja: (c.puja as string | null) ?? null,
      angulo: anguloDominante(composicionDeAngulos(videosDeCampana.get(c.id as string) ?? []).angulos),
      tope: topeDe(clave),
      total: totalCampana.get(c.id as string) ?? sinResultados(),
      v: ventCampana.get(c.id as string) ?? sinVentanas(),
    };
  });

  // Los videos: lo que cada uno gastó y vendió en todo el historial, con lo que la IA vio en él y el producto de su campaña más frecuente.
  const productoDeVideo = new Map<string, { nombre: string | null; clave: string; n: number }>();
  const nombreDeVideo = new Map<string, string>();
  for (const a of anun) {
    const vid = (a.video_id as string | null) ?? "";
    if (!vid) continue;
    const p = productoDe.get(a.campana_id as string);
    if (p?.nombre && !productoDeVideo.has(vid)) productoDeVideo.set(vid, { ...p, n: 1 });
    if (!nombreDeVideo.has(vid)) nombreDeVideo.set(vid, String((a.titulo as string | null) || (a.nombre as string | null) || `Video …${vid.slice(-5)}`).slice(0, 80));
  }
  const videos: VideoHist[] = [...totalVideo].map(([id, total]) => {
    const h = analisisDe.get(id);
    const p = productoDeVideo.get(id);
    const clave = p?.clave ?? "";
    return {
      id,
      nombre: nombreDeVideo.get(id) ?? `Video …${id.slice(-5)}`,
      producto: p?.nombre ?? null,
      clave,
      familia: familiaDeProducto(p?.nombre ?? "", null),
      angulo: (h?.angulo as string | null) || null,
      ganchoTipo: (h?.gancho_tipo as string | null) || null,
      formato: (h?.formato as string | null) || null,
      ctaTipo: (h?.cta_tipo as string | null) || null,
      tope: topeDe(clave),
      total,
    };
  });

  // Los pedidos de las tiendas de las cuentas: qué se entrega de cada producto.
  const { data: unidadesF } = await supabase.from("fin_unidades").select("id, nombre");
  const unidades = unidadesDeTiendas((unidadesF ?? []).map((u) => ({ id: u.id as string, nombre: String(u.nombre ?? "") })), cuentas.map((c) => String(c.tienda ?? "")));
  let entregas = new Map<string, EntregaProducto>();
  let pedidos = 0;
  if (unidades.length) {
    const lineas = await traerTodasLasFilas<Record<string, unknown>>((a, b) =>
      supabase
        .from("ven_orden_lineas")
        .select("producto, cantidad, es_servicio, ven_ordenes!inner(estado_entrega, fecha, unidad_id)")
        .in("ven_ordenes.unidad_id", unidades.map((u) => u.id))
        .gte("ven_ordenes.fecha", restar(hoy, DIAS_DE_ENTREGA))
        .order("orden_id")
        .order("linea")
        .range(a, b),
    ).catch((): Record<string, unknown>[] => []);
    pedidos = lineas.length;
    entregas = entregasPorProducto(
      lineas.map((l) => {
        const o2 = Array.isArray(l.ven_ordenes) ? (l.ven_ordenes as Record<string, unknown>[])[0] : (l.ven_ordenes as Record<string, unknown> | null);
        return { producto: String(l.producto ?? ""), cantidad: num(l.cantidad), estado: (o2?.estado_entrega as string | null) ?? null, servicio: l.es_servicio === true };
      }),
    );
  }
  const indiceVentas = indexarCatalogo([...entregas.keys()].map((nombre) => ({ nombre, clase: "" })));

  // Los productos de las campañas, cada uno con lo que sumaron y la entrega de su producto en la tienda (el que mejor lo nombra).
  const porClave = new Map<string, { nombre: string; campanas: CampanaHist[] }>();
  for (const c of campanas) {
    if (!c.producto) continue;
    const g = porClave.get(c.clave) ?? { nombre: c.producto, campanas: [] };
    g.campanas.push(c);
    porClave.set(c.clave, g);
  }
  const productos: ProductoHist[] = [...porClave].map(([clave, g]) => {
    const enTienda = productoEnVentas(g.nombre, indiceVentas);
    const v = g.campanas.reduce<Ventanas>(
      (t, c) => ({ mes: { rec: sumar(t.mes.rec, c.v.mes.rec), prev: sumar(t.mes.prev, c.v.mes.prev) }, semana: { rec: sumar(t.semana.rec, c.v.semana.rec), prev: sumar(t.semana.prev, c.v.semana.prev) } }),
      sinVentanas(),
    );
    return {
      clave,
      nombre: g.nombre,
      familia: familiaDeProducto(g.nombre, null),
      tope: topeDe(clave),
      campanas: g.campanas.length,
      total: g.campanas.reduce((t, c) => sumar(t, c.total), sinResultados()),
      v,
      entrega: enTienda ? (entregas.get(enTienda) ?? null) : null,
    };
  });

  return { analisis: analizarHistorico({ campanas, videos, productos, desde, hasta }), tiendas: unidades.map((u) => u.nombre), pedidos, vacio: false };
}

/** Todo el historial analizado para un país (y una cuenta, o todas), guardado 10 minutos. */
export const cargarHistorico = conTtl(10 * 60_000, (o: { paisId: string; cuentaId: string | null; hoy: string }) => `${o.paisId}|${o.cuentaId ?? "todas"}|${o.hoy}`, cargar, { esValido: (r) => !r.vacio });
