// Anuncios Meta: arma, desde las tablas `meta_*`, todo lo que ven las pantallas (campañas, anuncios, videos, qué funciona, sugerencias y equipo) para un periodo y una cuenta. El servidor suma y agrupa:
// al navegador solo viaja lo ya armado. Si falta la migración 0320, `faltaMigracion` lo dice y todo viene vacío.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { agrupar, copyLimpio, landingLimpia, type Elemento } from "./agrupar";
import { CPA_TOPE_PREDETERMINADO, resultado, sinResultados, sumar, type Resultados } from "./metricas";
import { claveDeProducto, NOMBRE_ETAPA, NOMBRE_PUJA, numeroDeVideo, type Estructura, type Etapa, type Puja } from "./nombre";
import { detalleLegible, esCreacionDeCampana } from "./normalizar";
import { anguloDeCampana, estructuraValida, VERSION_ANALISIS } from "./video-angulo";
import { diasEntre, pendientes, sugerir, type DecisionGuardada, type Sugerencia } from "./sugerencias";
import type { ActividadVista, AnalisisVideoVista, AnuncioVista, CampanaVista, Grupo, VideoVista } from "./vistas";

export const SIN_MIGRACION_META = "Falta correr la migración 0320 (Anuncios Meta) en Supabase.";

export type Periodo = "hoy" | "7" | "30";
export const PERIODOS: { valor: Periodo; etiqueta: string; dias: number }[] = [
  { valor: "hoy", etiqueta: "Hoy", dias: 1 },
  { valor: "7", etiqueta: "7 días", dias: 7 },
  { valor: "30", etiqueta: "30 días", dias: 30 },
];
export const periodoValido = (v: unknown): Periodo => (v === "hoy" || v === "30" ? v : "7");

export interface CuentaVista {
  id: string;
  nombre: string;
  actId: string;
  tienda: string | null;
  activa: boolean;
  ultimaLectura: string | null;
  ultimoError: string | null;
}

export interface FilaEquipo {
  persona: string;
  hoy: number;
  periodo: number;
  pctTesting: number | null;
  anunciosNuevos: number;
  testsGanadores: number;
  tests: number;
  gastoSinCompras: number;
  cambios: number;
  ultimo: string | null;
  /** Campañas creadas por día en los últimos 14 días, de la más vieja a la de hoy. */
  tira: number[];
}

export const DIMENSIONES = ["Ángulo", "Estructura", "Puja", "Copy", "Landing", "Producto", "Etapa"] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export interface TopeVista {
  clave: string;
  producto: string;
  tope: number;
}

export interface DatosMeta {
  faltaMigracion: boolean;
  cuentas: CuentaVista[];
  cuentaId: string | null;
  periodo: Periodo;
  desde: string;
  hasta: string;
  campanas: CampanaVista[];
  videos: VideoVista[];
  anuncios: AnuncioVista[];
  totales: Resultados;
  anteriores: Resultados;
  topes: TopeVista[];
  productos: string[];
  sugerencias: Sugerencia[];
  decididas: number;
  grupos: Record<Dimension, Grupo[]>;
  creadasPorDia: { fecha: string; testing: number; escala: number; retargeting: number; otras: number }[];
  creadasHoy: number;
  equipo: FilaEquipo[];
  actividadDisponible: boolean;
  /** Videos con gasto en 30 días que todavía no tienen análisis de IA, y si la IA (Gemini) está conectada. */
  videosSinAnalizar: number;
  /** Videos con gasto en el periodo elegido a los que todavía no se les conoce el ángulo (no hay análisis ni lo trae la campaña). */
  videosSinAngulo: number;
  /** Lo pone la página (servidor): si Gemini está conectado. No se calcula aquí porque este archivo también lo importan componentes del navegador. */
  iaConectada: boolean;
}

const vacios = (periodo: Periodo, hoy: string): DatosMeta => ({
  faltaMigracion: false, cuentas: [], cuentaId: null, periodo, desde: hoy, hasta: hoy, campanas: [], videos: [], anuncios: [], totales: sinResultados(), anteriores: sinResultados(), topes: [], productos: [], sugerencias: [], decididas: 0,
  grupos: { "Ángulo": [], Estructura: [], Puja: [], Copy: [], Landing: [], Producto: [], Etapa: [] }, creadasPorDia: [], creadasHoy: 0, equipo: [], videosSinAnalizar: 0, videosSinAngulo: 0, iaConectada: false, actividadDisponible: false,
});

const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;
/** La estructura guardada del video (jsonb), con la misma validación con que se guardó. */
const estructuraDeBase = (v: unknown) => estructuraValida(v);

interface FilaDia {
  anuncio_id: string;
  campana_id: string;
  fecha: string;
  gasto: unknown;
  impresiones: unknown;
  clics: unknown;
  video_3s: unknown;
  video_15s: unknown;
  video_25?: unknown;
  video_50?: unknown;
  video_75?: unknown;
  video_95?: unknown;
  vio_landing: unknown;
  carrito: unknown;
  pago: unknown;
  compras: unknown;
  valor: unknown;
}
const resultadosDe = (f: FilaDia): Resultados => ({ gasto: num(f.gasto), impresiones: num(f.impresiones), clics: num(f.clics), video3s: num(f.video_3s), video15s: num(f.video_15s), video25: num(f.video_25), video50: num(f.video_50), video75: num(f.video_75), video95: num(f.video_95), vioLanding: num(f.vio_landing), carrito: num(f.carrito), pago: num(f.pago), compras: num(f.compras), valor: num(f.valor) });

export async function cargarAnunciosMeta(supabase: SupabaseClient, o: { paisId: string; cuentaId: string | null; periodo: Periodo; hoy: string }): Promise<DatosMeta> {
  const base = vacios(o.periodo, o.hoy);
  const dias = PERIODOS.find((p) => p.valor === o.periodo)!.dias;
  const desde = restar(o.hoy, dias - 1);
  const anteriorDesde = restar(desde, dias);
  const { data: filasCuentas, error } = await supabase.from("meta_cuentas").select("id, nombre, act_id, tienda, activa, ultima_lectura_en, ultimo_error").eq("pais_id", o.paisId).order("nombre");
  if (error) return { ...base, faltaMigracion: /meta_cuentas|schema cache|does not exist/i.test(error.message) };
  const cuentas: CuentaVista[] = (filasCuentas ?? []).map((c) => ({ id: c.id as string, nombre: c.nombre as string, actId: c.act_id as string, tienda: (c.tienda as string | null) ?? null, activa: c.activa !== false, ultimaLectura: (c.ultima_lectura_en as string | null) ?? null, ultimoError: (c.ultimo_error as string | null) ?? null }));
  const cuentaId = o.cuentaId && cuentas.some((c) => c.id === o.cuentaId) ? o.cuentaId : null;
  const ids = (cuentaId ? [cuentaId] : cuentas.filter((c) => c.activa).map((c) => c.id));
  const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const [{ data: topesF }, { data: decisionesF }] = await Promise.all([supabase.from("meta_topes").select("producto_clave, producto, cpa_tope"), supabase.from("meta_decisiones").select("clave, estado, vigente_hasta")]);
  const topes: TopeVista[] = (topesF ?? []).map((t) => ({ clave: t.producto_clave as string, producto: t.producto as string, tope: num(t.cpa_tope) }));
  const topePorClave = new Map(topes.map((t) => [t.clave, t.tope]));
  const decisiones: DecisionGuardada[] = (decisionesF ?? []).map((d) => ({ clave: d.clave as string, estado: d.estado as DecisionGuardada["estado"], vigenteHasta: d.vigente_hasta as string }));
  if (!ids.length) return { ...base, cuentas, cuentaId, desde, hasta: o.hoy, topes };

  const desdeDatos = restar(o.hoy, Math.max(dias * 2, 30) - 1);
  const [camp, anun, dia, act, hechos] = await Promise.all([
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_campanas").select("id, cuenta_id, meta_id, nombre, estado, estructura, puja, presupuesto_diario, creada_meta_en, producto, angulo, etapa, manual, creada_por, mercado, videos, persona_nombre").in("cuenta_id", ids).range(a, b)),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_anuncios").select("id, campana_id, nombre, estado, video_id, miniatura, copy, titulo, landing").in("cuenta_id", ids).range(a, b)),
    // Sin la migración 0326 no hay retención del video: se leen las columnas de antes.
    traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, video_15s, video_25, video_50, video_75, video_95, vio_landing, carrito, pago, compras, valor").in("cuenta_id", ids).gte("fecha", desdeDatos).order("fecha").range(a, b)).catch(() =>
      traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, video_15s, vio_landing, carrito, pago, compras, valor").in("cuenta_id", ids).gte("fecha", desdeDatos).order("fecha").range(a, b)),
    ),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_actividad").select("fecha, actor_nombre, tipo, objeto_tipo, objeto_meta_id, objeto_nombre").in("cuenta_id", ids).gte("fecha", `${restar(o.hoy, 29)}T00:00:00Z`).order("fecha", { ascending: false }).range(a, b)).catch(() => []),
    // Sin la migración 0325 no hay análisis de videos: todo sigue funcionando sin ángulo de video.
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, estado, origen, angulo, angulo_manual, promesa, gancho, resumen, transcripcion, publico, formato, duracion_s, error, analizado_en, version, cta, cta_segundo, cta_tipo, oferta, recursos, estructura").range(a, b)).catch(() =>
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select("video_id, estado, origen, angulo, angulo_manual, promesa, gancho, resumen, transcripcion, publico, formato, duracion_s, error, analizado_en").range(a, b)).catch(() => []),
    ),
  ]);

  // Resultados por campaña, por anuncio y por día de campaña.
  const porCampana = new Map<string, Resultados>();
  const porCampana7 = new Map<string, Resultados>();
  const porCampana30 = new Map<string, Resultados>();
  const porAnuncio = new Map<string, Resultados>();
  const serie = new Map<string, { fecha: string; r: Resultados }[]>();
  const porVideo30 = new Map<string, Resultados>();
  const porAnuncio30 = new Map<string, Resultados>();
  let totales = sinResultados();
  let anteriores = sinResultados();
  const desde7 = restar(o.hoy, 6);
  const desde14 = restar(o.hoy, 13);
  const anuncioDe = new Map(anun.map((a) => [a.id as string, a]));
  for (const f of dia) {
    const r = resultadosDe(f);
    if (f.fecha >= desde) {
      porCampana.set(f.campana_id, sumar(porCampana.get(f.campana_id) ?? sinResultados(), r));
      porAnuncio.set(f.anuncio_id, sumar(porAnuncio.get(f.anuncio_id) ?? sinResultados(), r));
      totales = sumar(totales, r);
    } else if (f.fecha >= anteriorDesde) anteriores = sumar(anteriores, r);
    if (f.fecha >= desde7) porCampana7.set(f.campana_id, sumar(porCampana7.get(f.campana_id) ?? sinResultados(), r));
    if (f.fecha >= restar(o.hoy, 29)) {
      porCampana30.set(f.campana_id, sumar(porCampana30.get(f.campana_id) ?? sinResultados(), r));
      const v = anuncioDe.get(f.anuncio_id)?.video_id as string | undefined;
      if (v) porVideo30.set(v, sumar(porVideo30.get(v) ?? sinResultados(), r));
      porAnuncio30.set(f.anuncio_id, sumar(porAnuncio30.get(f.anuncio_id) ?? sinResultados(), r));
    }
    if (f.fecha >= desde14) {
      const l = serie.get(f.campana_id) ?? [];
      const ult = l[l.length - 1];
      if (ult && ult.fecha === f.fecha) ult.r = sumar(ult.r, r);
      else l.push({ fecha: f.fecha, r });
      serie.set(f.campana_id, l);
    }
  }

  const eventos = act as Record<string, unknown>[];
  const creaciones = new Map<string, string>();
  for (const e of eventos) if (esCreacionDeCampana({ tipo: String(e.tipo), objetoTipo: (e.objeto_tipo as string | null) ?? null }) && e.objeto_meta_id && e.actor_nombre) creaciones.set(String(e.objeto_meta_id), String(e.actor_nombre));

  // Análisis de los videos (IA) y, con ellos, el ángulo de cada campaña cuando el nombre no lo trae.
  const analisisDe = new Map<string, AnalisisVideoVista>();
  for (const h of hechos) {
    analisisDe.set(h.video_id as string, { estado: h.estado as AnalisisVideoVista["estado"], origen: h.origen as AnalisisVideoVista["origen"], angulo: (h.angulo as string | null) ?? null, anguloManual: !!h.angulo_manual, promesa: (h.promesa as string | null) ?? null, gancho: (h.gancho as string | null) ?? null, resumen: (h.resumen as string | null) ?? null, transcripcion: (h.transcripcion as string | null) ?? null, publico: (h.publico as string | null) ?? null, formato: (h.formato as string | null) ?? null, duracionS: h.duracion_s === null || h.duracion_s === undefined ? null : num(h.duracion_s), error: (h.error as string | null) ?? null, analizadoEn: h.analizado_en as string, version: h.version === undefined || h.version === null ? 1 : num(h.version), cta: (h.cta as string | null) ?? null, ctaSegundo: h.cta_segundo === null || h.cta_segundo === undefined ? null : num(h.cta_segundo), ctaTipo: (h.cta_tipo as string | null) ?? null, oferta: (h.oferta as string | null) ?? null, recursos: Array.isArray(h.recursos) ? (h.recursos as unknown[]).filter((x): x is string => typeof x === "string") : [], estructura: estructuraDeBase(h.estructura) });
  }
  const angulosPorCampana = new Map<string, { angulo: string; gasto: number }[]>();
  for (const a of anun) {
    const an = analisisDe.get((a.video_id as string | null) ?? "");
    if (!an?.angulo) continue;
    const l = angulosPorCampana.get(a.campana_id as string) ?? [];
    l.push({ angulo: an.angulo, gasto: porAnuncio30.get(a.id as string)?.gasto ?? 0 });
    angulosPorCampana.set(a.campana_id as string, l);
  }
  const anguloVideoDe = (campanaId: string) => anguloDeCampana(angulosPorCampana.get(campanaId) ?? []);

  const armar = (c: Record<string, unknown>, r: Resultados): CampanaVista => {
    const clave = claveDeProducto(c.producto as string | null);
    const tope = topePorClave.get(clave);
    return {
      id: c.id as string, cuentaId: c.cuenta_id as string, cuentaNombre: nombreCuenta.get(c.cuenta_id as string) ?? "", metaId: c.meta_id as string, nombre: c.nombre as string, estado: c.estado as string, activa: c.estado === "ACTIVE",
      etapa: (c.etapa as Etapa | null) ?? null, estructura: (c.estructura as Estructura | null) ?? null, puja: (c.puja as Puja | null) ?? null, producto: (c.producto as string | null) ?? null, angulo: (c.angulo as string | null) ?? anguloVideoDe(c.id as string),
      anguloOrigen: c.angulo ? ((c.manual as string[] | null) ?? []).includes("angulo") ? "manual" : "nombre" : anguloVideoDe(c.id as string) ? "video" : null,
      presupuestoDiario: c.presupuesto_diario === null || c.presupuesto_diario === undefined ? null : num(c.presupuesto_diario), creadaEn: (c.creada_meta_en as string | null) ?? null,
      persona: (c.persona_nombre as string | null) ?? (c.creada_por as string | null) ?? creaciones.get(c.meta_id as string) ?? null,
      personaMeta: (c.creada_por as string | null) ?? creaciones.get(c.meta_id as string) ?? null,
      mercado: (c.mercado as string | null) ?? null,
      videos: (c.videos as string | null) ?? null,
      r, tope: tope ?? CPA_TOPE_PREDETERMINADO, topeDefinido: tope !== undefined, manual: (c.manual as string[] | null) ?? [],
    };
  };
  const campanas = camp.map((c) => armar(c, porCampana.get(c.id as string) ?? sinResultados()));
  // Con un periodo corto (hoy), no se llena la lista de campañas que no gastaron ni se montaron en él.
  const campanasConActividad = campanas.filter((c) => c.r.gasto > 0 || c.activa || (c.creadaEn ?? "") >= desde);
  const campanasDe = new Map(campanas.map((c) => [c.id, c]));

  const anuncios: AnuncioVista[] = anun.map((a) => ({ id: a.id as string, campanaId: a.campana_id as string, nombre: a.nombre as string, activo: a.estado === "ACTIVE", videoId: (a.video_id as string | null) ?? null, miniatura: (a.miniatura as string | null) ?? null, copy: (a.copy as string | null) ?? null, titulo: (a.titulo as string | null) ?? null, landing: (a.landing as string | null) ?? null, r: porAnuncio.get(a.id as string) ?? sinResultados() }));

  // Videos (30 días): el mismo video en varios anuncios es uno solo.
  const videosMapa = new Map<string, { nombre: string; miniatura: string | null; anuncios: number; campanas: Set<string>; angulos: Map<string, number>; productos: Map<string, number>; detalle: VideoVista["anunciosDetalle"]; numero: string | null }>();
  for (const a of anun) {
    const v = a.video_id as string | null;
    if (!v) continue;
    const g = videosMapa.get(v) ?? { nombre: (a.titulo as string | null) || (a.nombre as string), miniatura: (a.miniatura as string | null) ?? null, anuncios: 0, campanas: new Set<string>(), angulos: new Map(), productos: new Map(), detalle: [] as VideoVista["anunciosDetalle"], numero: null };
    g.anuncios++;
    g.campanas.add(a.campana_id as string);
    const c = campanasDe.get(a.campana_id as string);
    if (c?.angulo) g.angulos.set(c.angulo, (g.angulos.get(c.angulo) ?? 0) + 1);
    if (c?.producto) g.productos.set(c.producto, (g.productos.get(c.producto) ?? 1) + 1);
    if (!g.miniatura && a.miniatura) g.miniatura = a.miniatura as string;
    // El número del video («V3») sale del nombre del anuncio: así se sabe cuál de la tanda es.
    g.numero ??= numeroDeVideo(`${a.nombre as string} ${(a.titulo as string | null) ?? ""}`);
    g.detalle.push({ id: a.id as string, nombre: a.nombre as string, activo: a.estado === "ACTIVE", campanaId: a.campana_id as string, campanaNombre: c?.nombre ?? "", etapa: c?.etapa ?? null, r: porAnuncio30.get(a.id as string) ?? sinResultados() });
    videosMapa.set(v, g);
  }
  const masFrecuente = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const videos: VideoVista[] = [...videosMapa]
    .map(([id, g]) => {
      const producto = masFrecuente(g.productos);
      return { id, nombre: g.nombre, miniatura: g.miniatura, producto, angulo: analisisDe.get(id)?.angulo ?? masFrecuente(g.angulos), analisis: analisisDe.get(id) ?? null, campanas: g.campanas.size, anuncios: g.anuncios, numero: g.numero, anunciosDetalle: g.detalle.sort((x, y) => y.r.gasto - x.r.gasto), r: porVideo30.get(id) ?? sinResultados(), tope: topePorClave.get(claveDeProducto(producto)) ?? CPA_TOPE_PREDETERMINADO };
    })
    .filter((v) => v.r.gasto > 0)
    .sort((a, b) => b.r.gasto - a.r.gasto);

  // Qué funciona: cada dimensión con las campañas (o anuncios) del periodo con gasto.
  const conGasto = campanas.filter((c) => c.r.gasto > 0);
  const deCampana = (clave: (c: CampanaVista) => string | null): Elemento[] => conGasto.map((c) => ({ clave: clave(c), r: c.r, tope: c.tope, campana: c.id }));
  const deAnuncio = (clave: (a: AnuncioVista) => string | null): Elemento[] =>
    anuncios.filter((a) => a.r.gasto > 0).map((a) => ({ clave: clave(a), r: a.r, tope: campanasDe.get(a.campanaId)?.tope ?? CPA_TOPE_PREDETERMINADO, campana: a.campanaId, video: a.videoId }));
  // El ángulo se mide por video (18 nov 2026): el de su análisis (o el que se corrigió a mano) y, sin análisis, solo el que la campaña trae en su nombre o a mano. Nunca el que la campaña heredó de otros videos.
  const anguloDeAnuncio = (a: AnuncioVista): string | null => {
    const deVideo = a.videoId ? analisisDe.get(a.videoId)?.angulo : null;
    if (deVideo) return deVideo;
    const c = campanasDe.get(a.campanaId);
    return c && (c.anguloOrigen === "nombre" || c.anguloOrigen === "manual") ? c.angulo : null;
  };
  const videosSinAngulo = new Set(anuncios.filter((a) => a.r.gasto > 0 && a.videoId && !anguloDeAnuncio(a)).map((a) => a.videoId as string)).size;
  const grupos: Record<Dimension, Grupo[]> = {
    "Ángulo": agrupar(deAnuncio(anguloDeAnuncio)),
    Estructura: agrupar(deCampana((c) => c.estructura)),
    Puja: agrupar(deCampana((c) => (c.puja ? NOMBRE_PUJA[c.puja] : null))),
    Copy: agrupar(deAnuncio((a) => copyLimpio(a.copy))),
    Landing: agrupar(deAnuncio((a) => landingLimpia(a.landing))),
    Producto: agrupar(deCampana((c) => c.producto)),
    Etapa: agrupar(deCampana((c) => (c.etapa ? NOMBRE_ETAPA[c.etapa] : null))),
  };

  // Sugerencias: siempre con los últimos 7 días de las campañas y 30 de los videos, sin importar el periodo que se mira.
  const campanas7 = camp.map((c) => armar(c, porCampana7.get(c.id as string) ?? sinResultados()));
  const todas = sugerir({ campanas: campanas7, serie, videos, hoy: o.hoy });
  const sugerencias = pendientes(todas, decisiones, o.hoy);

  // Campañas montadas por día (14 días) y por persona.
  const creadasPorDia = Array.from({ length: 14 }, (_, i) => ({ fecha: restar(o.hoy, 13 - i), testing: 0, escala: 0, retargeting: 0, otras: 0 }));
  for (const c of campanas) {
    const f = (c.creadaEn ?? "").slice(0, 10);
    const d = creadasPorDia.find((x) => x.fecha === f);
    if (d) d[c.etapa ?? "otras"]++;
  }
  const personas = new Map<string, FilaEquipo>();
  const fila = (p: string): FilaEquipo => {
    const f = personas.get(p) ?? { persona: p, hoy: 0, periodo: 0, pctTesting: null, anunciosNuevos: 0, testsGanadores: 0, tests: 0, gastoSinCompras: 0, cambios: 0, ultimo: null, tira: Array(14).fill(0) };
    personas.set(p, f);
    return f;
  };
  for (const c of campanas) {
    if (!c.persona || !c.creadaEn) continue;
    const dia = c.creadaEn.slice(0, 10);
    const i = diasEntre(dia, o.hoy);
    const f = fila(c.persona);
    if (i >= 0 && i < 14) f.tira[13 - i]++;
    if (dia === o.hoy) f.hoy++;
    if (dia >= desde) {
      f.periodo++;
      if (c.etapa === "testing") f.tests++;
    }
    if (c.etapa === "testing" && c.r.gasto > 0 && dia >= restar(o.hoy, 29)) {
      if (resultado(c.r, c.tope) > 0) f.testsGanadores++;
      if (c.r.compras === 0) f.gastoSinCompras += c.r.gasto;
    }
  }
  for (const e of eventos) {
    const p = e.actor_nombre as string | null;
    if (!p) continue;
    const f = fila(p);
    const fecha = String(e.fecha);
    if (!f.ultimo || fecha > f.ultimo) f.ultimo = fecha;
    if (String(e.fecha).slice(0, 10) >= desde) {
      if (String(e.tipo) === "create_ad") f.anunciosNuevos++;
      else if (!esCreacionDeCampana({ tipo: String(e.tipo), objetoTipo: null })) f.cambios++;
    }
  }
  const equipo = [...personas.values()].map((f) => ({ ...f, pctTesting: f.periodo ? Math.round((f.tests / f.periodo) * 100) : null })).sort((a, b) => b.periodo - a.periodo);

  const productos = [...new Set(camp.map((c) => (c.producto as string | null)?.trim()).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "es"));
  return {
    ...base, cuentas, cuentaId, desde, hasta: o.hoy, campanas: campanasConActividad, videos, anuncios, totales, anteriores, topes, productos, sugerencias, decididas: todas.length - sugerencias.length, grupos,
    creadasPorDia, creadasHoy: creadasPorDia[13]?.testing + creadasPorDia[13]?.escala + creadasPorDia[13]?.retargeting + creadasPorDia[13]?.otras || 0, equipo, actividadDisponible: eventos.length > 0, videosSinAnalizar: videos.filter((v) => !v.analisis || v.analisis.estado !== "analizado" || v.analisis.version < VERSION_ANALISIS).length, videosSinAngulo, iaConectada: false,
  };
}

/** Lo que dice el registro de actividad sobre una campaña (la línea de tiempo de su ficha). */
export async function actividadDeCampana(supabase: SupabaseClient, campanaId: string): Promise<ActividadVista[]> {
  const { data: c } = await supabase.from("meta_campanas").select("meta_id, cuenta_id").eq("id", campanaId).maybeSingle();
  if (!c) return [];
  const { data } = await supabase.from("meta_actividad").select("fecha, actor_nombre, tipo, objeto_nombre, detalle").eq("cuenta_id", c.cuenta_id).eq("objeto_meta_id", c.meta_id).order("fecha", { ascending: false }).limit(40);
  return (data ?? []).map((e) => ({ fecha: e.fecha as string, actor: (e.actor_nombre as string | null) ?? null, tipo: e.tipo as string, objeto: (e.objeto_nombre as string | null) ?? null, detalle: detalleLegible(e.detalle as string | null) }));
}
