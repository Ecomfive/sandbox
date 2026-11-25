// Anuncios Meta: arma, desde las tablas `meta_*`, todo lo que ven las pantallas (campañas, anuncios, videos, qué funciona, sugerencias y equipo) para un periodo y una cuenta. El servidor suma y agrupa:
// al navegador solo viaja lo ya armado. Si falta la migración 0320, `faltaMigracion` lo dice y todo viene vacío.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { resumirEquipo, type CreacionDeCampana, type DatosActividad, type EventoDeActividad } from "./actividad-equipo";
import { agrupar, copyLimpio, landingLimpia, type Elemento } from "./agrupar";
import { anguloDominante, composicionDeAngulos, gruposDeVideos, type GruposDeVideo } from "./atributos-video";
import { CPA_TOPE_PREDETERMINADO, sinResultados, sumar, type Resultados } from "./metricas";
import { nombreDeAngulo, temasDe } from "./angulo-detalle";
import { calcularEnMarcha, campanaEnMarcha, enLaVista, hallazgosEnVista, productoEnMarcha, type EnMarcha, type VistaActividad } from "./en-marcha";
import { pendienteDeProducto, pendientesPorCampana, pendientesPorVideo } from "./prioridad";
import { claveDeProducto, NOMBRE_ETAPA, NOMBRE_PUJA, numeroDeVideo, type Estructura, type Etapa, type Puja } from "./nombre";
import { detalleLegible, esCreacionDeCampana } from "./normalizar";
import { estructuraValida, VERSION_ANALISIS } from "./video-angulo";
import { decisionesDeAnuncios } from "./decision-anuncio";
import { etapaEfectiva, indexarCatalogo, productoDeCampana, type IndiceCatalogo } from "./etapa-venta";
import { pendientes, sugerenciasDeHallazgos, sugerir, type DecisionGuardada, type Sugerencia } from "./sugerencias";
import { claveDeAnalisis, analisisViejo, seccionesDeAnalisis, type AnalisisGuardado, type HistorialSecciones } from "./analisis-tipos";
import { claveDePaginasMedidas, leerValorPaginas } from "./diagnostico-concreto";
import { hallazgoDeVigilancia, ordenarVigilancias, type ResultadoVigilancia } from "./analisis-pedido";
import { claveDeRasgos, leerValorRasgos, type RasgosDeGanadores } from "./rasgos-ganadores";
import { claveDeSenales, leerValorSenales, type SenalesCreativas } from "./senales-creativas";
import { claveDeResultados, leerValorResultados } from "./vigilancias";
import { claveDeInterpretacion, leerValorInterpretacion, type InterpretacionGuardada } from "./interpretacion-guardada";
import { agruparProductos } from "./productos";
import type { ActividadVista, AnalisisVideoVista, AnuncioVista, CampanaVista, Grupo, ProductoVista, VideoVista } from "./vistas";

export const SIN_MIGRACION_META = "Falta correr la migración 0320 (Anuncios Meta) en Supabase.";

export type Periodo = "hoy" | "4" | "7" | "30" | "90" | "180" | "365";
export const PERIODOS: { valor: Periodo; etiqueta: string; dias: number }[] = [
  { valor: "hoy", etiqueta: "Hoy", dias: 1 },
  { valor: "4", etiqueta: "4 días", dias: 4 },
  { valor: "7", etiqueta: "7 días", dias: 7 },
  { valor: "30", etiqueta: "30 días", dias: 30 },
  { valor: "90", etiqueta: "3 meses", dias: 90 },
  { valor: "180", etiqueta: "6 meses", dias: 180 },
  { valor: "365", etiqueta: "1 año", dias: 365 },
];
export const periodoValido = (v: unknown): Periodo => (v === "hoy" || v === "4" || v === "30" || v === "90" || v === "180" || v === "365" ? v : "7");

export interface CuentaVista {
  id: string;
  nombre: string;
  actId: string;
  tienda: string | null;
  activa: boolean;
  ultimaLectura: string | null;
  ultimoError: string | null;
}

/** Las formas de medir campañas y anuncios en «Qué funciona». El ángulo de una campaña sale de la mezcla de los ángulos de sus videos; los ángulos y demás datos de los videos se miden en `gruposVideo`. */
export const DIMENSIONES_CAMPANA = ["Ángulo", "Estructura", "Puja", "Producto", "Etapa"] as const;
export type DimensionCampana = (typeof DIMENSIONES_CAMPANA)[number];
export const DIMENSIONES_ANUNCIO = ["Copy", "Landing"] as const;
export type DimensionAnuncio = (typeof DIMENSIONES_ANUNCIO)[number];

export interface GruposMeta {
  campana: Record<DimensionCampana, Grupo[]>;
  anuncio: Record<DimensionAnuncio, Grupo[]>;
}

/** Un punto de la serie de gasto y compras: un día (hasta 90 días) o una semana (más de 90 días). */
export interface PuntoSerie {
  fecha: string;
  etiqueta: string;
  gasto: number;
  compras: number;
}

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
  grupos: GruposMeta;
  /** Gasto y compras del periodo, día por día (o semana por semana con más de 90 días), con todos los días del periodo aunque no hayan gastado. */
  serie: PuntoSerie[];
  /** Productos y campañas con una campaña activa que gastó en los últimos 7 días. */
  enMarcha: EnMarcha;
  /** Todo lo que la IA sacó de los videos del periodo (ángulo, gancho, formato, llamado, recursos, estructura…), medido con lo que costó y vendió cada video. */
  gruposVideo: GruposDeVideo;
  /** Los productos con lo que sumaron sus campañas en el periodo. */
  productosVista: ProductoVista[];
  creadasPorDia: { fecha: string; testing: number; venta: number; escala: number; retargeting: number; otras: number }[];
  creadasHoy: number;
  /** La actividad del equipo con todas las cuentas del país juntas (o solo la elegida): campañas por persona, promedios, rangos y lo más reciente. */
  actividad: DatosActividad;
  actividadDisponible: boolean;
  /** Videos analizados cuyo gancho todavía no tiene tipo (se clasifica con el texto del gancho, sin volver a ver el video). */
  ganchosSinTipo: number;
  /** Videos del periodo elegido que todavía no tienen análisis de IA (o lo tienen incompleto), y si la IA (Gemini) está conectada. */
  videosSinAnalizar: number;
  /** Videos con gasto en el periodo elegido a los que todavía no se les conoce el ángulo (no hay análisis ni lo trae la campaña). */
  videosSinAngulo: number;
  /** La interpretación con IA del historial (la hace el sistema solo, una vez al día), con la segunda opinión si hay dos IA. null si todavía no hay. */
  interpretacion: InterpretacionGuardada | null;
  /** Cuándo se hizo el análisis del historial que alimenta las sugerencias, o null si todavía no hay (se prepara solo). */
  analisisGeneradoEn: string | null;
  /** Hay que preparar el análisis del historial (no existe o es de hace más de un día): la página lo lanza en segundo plano. */
  analisisPendiente: boolean;
  /** Lo que la gente le pidió al chat que vigile (y lo que el sistema vigila por insistencia), ya evaluado, las que están en alerta primero. */
  vigilancias: ResultadoVigilancia[];
  /** Los creativos de los productos que empeoran o más gastan, mirados por dentro (cansancio, dependencia de un video, falta de renovación). */
  senales: SenalesCreativas[];
  /** Qué tienen en común los anuncios y las páginas que funcionaron, por métrica (CTR, hook, clic a visita, conversión). */
  rasgos: RasgosDeGanadores[];
  /** Los hallazgos, la entrega y lo que genera más ventas del historial, repartidos por pantalla (Productos, Campañas, Videos). null si todavía no hay análisis guardado. */
  historial: HistorialSecciones | null;
  /** Lo pone la página (servidor): si Gemini está conectado. No se calcula aquí porque este archivo también lo importan componentes del navegador. */
  iaConectada: boolean;
}

const vacios = (periodo: Periodo, hoy: string): DatosMeta => ({
  faltaMigracion: false, cuentas: [], cuentaId: null, periodo, desde: hoy, hasta: hoy, campanas: [], videos: [], anuncios: [], totales: sinResultados(), anteriores: sinResultados(), topes: [], productos: [], sugerencias: [], decididas: 0,
  grupos: { campana: { "Ángulo": [], Estructura: [], Puja: [], Producto: [], Etapa: [] }, anuncio: { Copy: [], Landing: [] } }, serie: [], gruposVideo: gruposDeVideos([]), interpretacion: null, analisisGeneradoEn: null, analisisPendiente: false, vigilancias: [], senales: [], rasgos: [], historial: null, productosVista: [], enMarcha: { productos: [], campanas: [] }, creadasPorDia: [], creadasHoy: 0, actividad: resumirEquipo([], [], hoy), ganchosSinTipo: 0, videosSinAnalizar: 0, videosSinAngulo: 0, iaConectada: false, actividadDisponible: false,
});

const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const COLUMNAS_ANALISIS_BASE = "video_id, estado, origen, angulo, angulo_manual, promesa, gancho, resumen, transcripcion, publico, formato, duracion_s, error, analizado_en";
const COLUMNAS_ANALISIS_V2 = "version, cta, cta_segundo, cta_tipo, oferta, recursos, estructura";
/** Cuántos días hacia atrás se lee el registro de actividad de Meta (lo que cada persona montó y cambió). */
export const DIAS_DE_ACTIVIDAD = 180;
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
  video_reproducciones?: unknown;
  video_segundos?: unknown;
  vio_landing: unknown;
  carrito: unknown;
  pago: unknown;
  compras: unknown;
  valor: unknown;
}
const resultadosDe = (f: FilaDia): Resultados => ({ gasto: num(f.gasto), impresiones: num(f.impresiones), clics: num(f.clics), video3s: num(f.video_3s), video15s: num(f.video_15s), video25: num(f.video_25), video50: num(f.video_50), video75: num(f.video_75), video95: num(f.video_95), reproducciones: num(f.video_reproducciones), segundosVistos: num(f.video_segundos), vioLanding: num(f.vio_landing), carrito: num(f.carrito), pago: num(f.pago), compras: num(f.compras), valor: num(f.valor) });

export async function cargarAnunciosMeta(supabase: SupabaseClient, o: { paisId: string; cuentaId: string | null; periodo: Periodo; hoy: string; /** La llave de un producto (`claveDeProducto`): «Qué funciona» se calcula solo con sus campañas, anuncios y videos. */ producto?: string | null; /** «Qué funciona» solo con lo que está en marcha o solo con lo apagado (sin esto, todo). */ ver?: VistaActividad | null }): Promise<DatosMeta> {
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
  const [{ data: topesF }, { data: decisionesF }, { data: ajustesF }] = await Promise.all([
    supabase.from("meta_topes").select("producto_clave, producto, cpa_tope"),
    supabase.from("meta_decisiones").select("clave, estado, vigente_hasta"),
    // El análisis del historial y su interpretación con IA los prepara el sistema solo y se guardan aquí (sin la migración 0347 no hay nada y todo sigue como antes).
    supabase.from("meta_ajustes").select("clave, valor").in("clave", [claveDeAnalisis(o.paisId), claveDeInterpretacion(o.paisId), claveDeResultados(o.paisId), claveDeSenales(o.paisId), claveDeRasgos(o.paisId), claveDePaginasMedidas(o.paisId)]),
  ]);
  const valorDe = (clave: string) => (ajustesF ?? []).find((a) => a.clave === clave)?.valor ?? null;
  const analisisGuardado = valorDe(claveDeAnalisis(o.paisId)) as Partial<AnalisisGuardado> | null;
  const hallazgosGuardados = analisisGuardado && typeof analisisGuardado.generadoEn === "string" && analisisGuardado.analisis && Array.isArray(analisisGuardado.analisis.hallazgos) ? (analisisGuardado as AnalisisGuardado) : null;
  const interpretacion = leerValorInterpretacion(valorDe(claveDeInterpretacion(o.paisId)));
  const rasgos = leerValorRasgos(valorDe(claveDeRasgos(o.paisId)))?.items ?? [];
  const senales = leerValorSenales(valorDe(claveDeSenales(o.paisId)))?.items ?? [];
  const vigilancias = ordenarVigilancias(leerValorResultados(valorDe(claveDeResultados(o.paisId)))?.resultados ?? []);
  const topes: TopeVista[] = (topesF ?? []).map((t) => ({ clave: t.producto_clave as string, producto: t.producto as string, tope: num(t.cpa_tope) }));
  const topePorClave = new Map(topes.map((t) => [t.clave, t.tope]));
  const decisiones: DecisionGuardada[] = (decisionesF ?? []).map((d) => ({ clave: d.clave as string, estado: d.estado as DecisionGuardada["estado"], vigenteHasta: d.vigente_hasta as string }));
  if (!ids.length) return { ...base, cuentas, cuentaId, desde, hasta: o.hoy, topes };

  // El periodo anterior (para comparar) solo se carga hasta 3 meses; con 6 meses o 1 año se muestra solo el periodo.
  const desdeDatos = restar(o.hoy, (dias > 90 ? dias : Math.max(dias * 2, 30)) - 1);
  const [camp, anun, dia, act, hechos, catalogo, frecuencias] = await Promise.all([
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_campanas").select("id, cuenta_id, meta_id, nombre, estado, estructura, puja, presupuesto_diario, creada_meta_en, producto, angulo, etapa, manual, creada_por, mercado, videos, persona_nombre").in("cuenta_id", ids).range(a, b)),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_anuncios").select("id, meta_id, cuenta_id, campana_id, nombre, estado, video_id, miniatura, copy, titulo, landing").in("cuenta_id", ids).range(a, b)),
    // Sin la migración 0326 no hay retención del video: se leen las columnas de antes.
    traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, video_15s, video_25, video_50, video_75, video_95, video_reproducciones, video_segundos, vio_landing, carrito, pago, compras, valor").in("cuenta_id", ids).gte("fecha", desdeDatos).order("fecha").range(a, b)).catch(() =>
    traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, video_15s, video_25, video_50, video_75, video_95, vio_landing, carrito, pago, compras, valor").in("cuenta_id", ids).gte("fecha", desdeDatos).order("fecha").range(a, b))).catch(() =>
      traerTodasLasFilas<FilaDia>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, campana_id, fecha, gasto, impresiones, clics, video_3s, video_15s, vio_landing, carrito, pago, compras, valor").in("cuenta_id", ids).gte("fecha", desdeDatos).order("fecha").range(a, b)),
    ),
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_actividad").select("fecha, cuenta_id, actor_nombre, tipo, objeto_tipo, objeto_meta_id, objeto_nombre, detalle").in("cuenta_id", ids).gte("fecha", `${restar(o.hoy, DIAS_DE_ACTIVIDAD - 1)}T00:00:00Z`).order("fecha", { ascending: false }).range(a, b)).catch(() => []),
    // Sin la migración 0338 no hay tipo de gancho, sin la 0326 no hay estructura ni llamado y sin la 0325 no hay análisis de videos: cada una cae a lo de antes.
    // (la 0357 trae además el detalle del ángulo).
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select(`${COLUMNAS_ANALISIS_BASE}, ${COLUMNAS_ANALISIS_V2}, gancho_tipo, angulo_detalle`).range(a, b)).catch(() =>
      traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select(`${COLUMNAS_ANALISIS_BASE}, ${COLUMNAS_ANALISIS_V2}, gancho_tipo`).range(a, b)).catch(() =>
        traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select(`${COLUMNAS_ANALISIS_BASE}, ${COLUMNAS_ANALISIS_V2}`).range(a, b)).catch(() =>
          traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_video_analisis").select(COLUMNAS_ANALISIS_BASE).range(a, b)).catch(() => []),
        ),
      ),
    ),
    // Los productos de Producto (nombre y clase) para saber si el de una campaña ya salió de Test. Si no se pueden leer, las campañas quedan con la etapa que dice su nombre.
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("skus_maestros").select("nombre, clase").range(a, b)).then((f) => indexarCatalogo(f.map((x) => ({ nombre: String(x.nombre ?? ""), clase: String(x.clase ?? "") })))).catch((): IndiceCatalogo | null => null),
    // La frecuencia de los últimos 7 días de cada anuncio y campaña (migración 0356); sin ella, no se muestra.
    traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("meta_frecuencia").select("cuenta_id, tipo, meta_id, frecuencia, alcance").in("cuenta_id", ids).range(a, b)).catch((): Record<string, unknown>[] => []),
  ]);
  const frecuenciaDe = new Map<string, number>();
  for (const f of frecuencias) frecuenciaDe.set(`${f.tipo}|${f.cuenta_id}|${f.meta_id}`, num(f.frecuencia));

  // Resultados por campaña, por anuncio y por día de campaña.
  const porCampana = new Map<string, Resultados>();
  const porCampana7 = new Map<string, Resultados>();
  const porCampana30 = new Map<string, Resultados>();
  const porAnuncio = new Map<string, Resultados>();
  const serie = new Map<string, { fecha: string; r: Resultados }[]>();
  const porVideo30 = new Map<string, Resultados>();
  const porVideoPeriodo = new Map<string, Resultados>();
  const porAnuncio30 = new Map<string, Resultados>();
  const porAnuncio7 = new Map<string, Resultados>();
  const porAnuncio2 = new Map<string, Resultados>();
  const porAnuncioDia = new Map<string, Map<string, Resultados>>();
  let totales = sinResultados();
  let anteriores = sinResultados();
  const porDiaPeriodo = new Map<string, { gasto: number; compras: number }>();
  const desde7 = restar(o.hoy, 6);
  const desde2 = restar(o.hoy, 1);
  const desde14 = restar(o.hoy, 13);
  const anuncioDe = new Map(anun.map((a) => [a.id as string, a]));
  for (const f of dia) {
    const r = resultadosDe(f);
    if (f.fecha >= desde) {
      porCampana.set(f.campana_id, sumar(porCampana.get(f.campana_id) ?? sinResultados(), r));
      porAnuncio.set(f.anuncio_id, sumar(porAnuncio.get(f.anuncio_id) ?? sinResultados(), r));
      const vp = anuncioDe.get(f.anuncio_id)?.video_id as string | undefined;
      if (vp) porVideoPeriodo.set(vp, sumar(porVideoPeriodo.get(vp) ?? sinResultados(), r));
      totales = sumar(totales, r);
      const d = porDiaPeriodo.get(f.fecha) ?? { gasto: 0, compras: 0 };
      d.gasto += r.gasto;
      d.compras += r.compras;
      porDiaPeriodo.set(f.fecha, d);
    } else if (f.fecha >= anteriorDesde) anteriores = sumar(anteriores, r);
    if (f.fecha >= desde7) {
      porCampana7.set(f.campana_id, sumar(porCampana7.get(f.campana_id) ?? sinResultados(), r));
      porAnuncio7.set(f.anuncio_id, sumar(porAnuncio7.get(f.anuncio_id) ?? sinResultados(), r));
    }
    if (f.fecha >= desde2) porAnuncio2.set(f.anuncio_id, sumar(porAnuncio2.get(f.anuncio_id) ?? sinResultados(), r));
    if (f.fecha >= desde2) {
      const dias = porAnuncioDia.get(f.anuncio_id) ?? new Map<string, Resultados>();
      dias.set(f.fecha, sumar(dias.get(f.fecha) ?? sinResultados(), r));
      porAnuncioDia.set(f.anuncio_id, dias);
    }
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
    analisisDe.set(h.video_id as string, { estado: h.estado as AnalisisVideoVista["estado"], origen: h.origen as AnalisisVideoVista["origen"], angulo: (h.angulo as string | null) ?? null, anguloDetalle: (h.angulo_detalle as string | null) || null, anguloManual: !!h.angulo_manual, promesa: (h.promesa as string | null) ?? null, gancho: (h.gancho as string | null) ?? null, ganchoTipo: (h.gancho_tipo as string | null) ?? null, resumen: (h.resumen as string | null) ?? null, transcripcion: (h.transcripcion as string | null) ?? null, publico: (h.publico as string | null) ?? null, formato: (h.formato as string | null) ?? null, duracionS: h.duracion_s === null || h.duracion_s === undefined ? null : num(h.duracion_s), error: (h.error as string | null) ?? null, analizadoEn: h.analizado_en as string, version: h.version === undefined || h.version === null ? 1 : num(h.version), cta: (h.cta as string | null) ?? null, ctaSegundo: h.cta_segundo === null || h.cta_segundo === undefined ? null : num(h.cta_segundo), ctaTipo: (h.cta_tipo as string | null) ?? null, oferta: (h.oferta as string | null) ?? null, recursos: Array.isArray(h.recursos) ? (h.recursos as unknown[]).filter((x): x is string => typeof x === "string") : [], estructura: estructuraDeBase(h.estructura) });
  }
  // De qué ángulos está hecha cada campaña: los de sus videos (cada video distinto, una vez), con lo que gastó cada anuncio en el periodo.
  const videosPorCampana = new Map<string, { videoId: string; angulo: string | null; detalle: string | null; gasto: number }[]>();
  for (const a of anun) {
    const vid = (a.video_id as string | null) ?? "";
    if (!vid) continue;
    const l = videosPorCampana.get(a.campana_id as string) ?? [];
    l.push({ videoId: vid, angulo: analisisDe.get(vid)?.angulo ?? null, detalle: analisisDe.get(vid)?.anguloDetalle ?? null, gasto: porAnuncio.get(a.id as string)?.gasto ?? 0 });
    videosPorCampana.set(a.campana_id as string, l);
  }
  const mezclaDe = (campanaId: string) => composicionDeAngulos(videosPorCampana.get(campanaId) ?? []);

  const armar = (c: Record<string, unknown>, r: Resultados): CampanaVista => {
    const clave = claveDeProducto(c.producto as string | null);
    const tope = topePorClave.get(clave);
    const mezcla = mezclaDe(c.id as string);
    const delVideo = anguloDominante(mezcla.angulos);
    const manual = ((c.manual as string[] | null) ?? []).includes("angulo");
    const delNombreEtapa = (c.etapa as Etapa | null) ?? null;
    const efectiva = catalogo ? etapaEfectiva({ delNombre: delNombreEtapa, manual: ((c.manual as string[] | null) ?? []).includes("etapa"), producto: productoDeCampana(c.producto as string | null, catalogo), creadaEn: (c.creada_meta_en as string | null) ?? null }) : null;
    const delNombre = (c.angulo as string | null) ?? null;
    // El ángulo de la campaña: el que se corrigió a mano; si no, el que domina entre sus videos (o «Mezcla de ángulos»); si los videos no tienen ángulo, el que traía el nombre.
    const angulo = manual && delNombre ? delNombre : (delVideo ?? delNombre);
    return {
      id: c.id as string, cuentaId: c.cuenta_id as string, cuentaNombre: nombreCuenta.get(c.cuenta_id as string) ?? "", metaId: c.meta_id as string, nombre: c.nombre as string, estado: c.estado as string, activa: c.estado === "ACTIVE",
      frecuencia: frecuenciaDe.get(`campana|${c.cuenta_id as string}|${c.meta_id as string}`) ?? null,
      etapa: efectiva ? efectiva.etapa : delNombreEtapa, etapaMotivo: efectiva ? efectiva.motivo : null, estructura: (c.estructura as Estructura | null) ?? null, puja: (c.puja as Puja | null) ?? null, producto: (c.producto as string | null) ?? null, angulo, angulos: mezcla.angulos, videosTotal: mezcla.videosTotal, videosConAngulo: mezcla.videosConAngulo,
      anguloOrigen: manual && delNombre ? "manual" : delVideo ? "video" : delNombre ? "nombre" : null,
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

  const anuncios: AnuncioVista[] = anun.map((a) => ({ id: a.id as string, campanaId: a.campana_id as string, nombre: a.nombre as string, activo: a.estado === "ACTIVE", videoId: (a.video_id as string | null) ?? null, miniatura: (a.miniatura as string | null) ?? null, copy: (a.copy as string | null) ?? null, titulo: (a.titulo as string | null) ?? null, landing: (a.landing as string | null) ?? null, numero: numeroDeVideo(String(a.nombre ?? "")), angulo: nombreDeAngulo(analisisDe.get(String(a.video_id ?? ""))?.angulo ?? null, analisisDe.get(String(a.video_id ?? ""))?.anguloDetalle), decision: null, decisionMotivo: null, frecuencia: frecuenciaDe.get(`anuncio|${a.cuenta_id as string}|${a.meta_id as string}`) ?? null, r: porAnuncio.get(a.id as string) ?? sinResultados() }));

  // Videos (30 días): el mismo video en varios anuncios es uno solo.
  const videosMapa = new Map<string, { nombre: string; miniatura: string | null; anuncios: number; campanas: Set<string>; angulos: Map<string, number>; productos: Map<string, number>; detalle: VideoVista["anunciosDetalle"]; numero: string | null }>();
  for (const a of anun) {
    const v = a.video_id as string | null;
    if (!v) continue;
    const g = videosMapa.get(v) ?? { nombre: (a.titulo as string | null) || (a.nombre as string), miniatura: (a.miniatura as string | null) ?? null, anuncios: 0, campanas: new Set<string>(), angulos: new Map(), productos: new Map(), detalle: [] as VideoVista["anunciosDetalle"], numero: null };
    g.anuncios++;
    g.campanas.add(a.campana_id as string);
    const c = campanasDe.get(a.campana_id as string);
    // El ángulo de un video no se hereda de lo que dicen sus campañas (eso viene de otros videos): solo cuenta el que una campaña trae en su nombre o se corrigió a mano.
    if (c?.angulo && (c.anguloOrigen === "nombre" || c.anguloOrigen === "manual")) g.angulos.set(c.angulo, (g.angulos.get(c.angulo) ?? 0) + 1);
    if (c?.producto) g.productos.set(c.producto, (g.productos.get(c.producto) ?? 1) + 1);
    if (!g.miniatura && a.miniatura) g.miniatura = a.miniatura as string;
    // El número del video («V3») sale del nombre del anuncio: así se sabe cuál de la tanda es.
    g.numero ??= numeroDeVideo(`${a.nombre as string} ${(a.titulo as string | null) ?? ""}`);
    g.detalle.push({ id: a.id as string, nombre: a.nombre as string, activo: a.estado === "ACTIVE", campanaId: a.campana_id as string, campanaNombre: c?.nombre ?? "", etapa: c?.etapa ?? null, r: sinResultados() });
    videosMapa.set(v, g);
  }
  const masFrecuente = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  // La lista de Videos sigue el periodo elegido; las sugerencias usan siempre los últimos 30 días.
  const armarVideos = (porVideo: Map<string, Resultados>, porAnuncioMapa: Map<string, Resultados>): VideoVista[] =>
    [...videosMapa]
      .map(([id, g]) => {
        const producto = masFrecuente(g.productos);
        const detalle = g.detalle.map((d) => ({ ...d, r: porAnuncioMapa.get(d.id) ?? sinResultados() })).sort((x, y) => y.r.gasto - x.r.gasto);
        return { id, nombre: g.nombre, miniatura: g.miniatura, producto, angulo: analisisDe.get(id)?.angulo ?? masFrecuente(g.angulos), analisis: analisisDe.get(id) ?? null, campanas: g.campanas.size, anuncios: g.anuncios, numero: g.numero, anunciosDetalle: detalle, r: porVideo.get(id) ?? sinResultados(), tope: topePorClave.get(claveDeProducto(producto)) ?? CPA_TOPE_PREDETERMINADO };
      })
      .filter((v) => v.r.gasto > 0)
      .sort((a, b) => b.r.gasto - a.r.gasto);
  const videos = armarVideos(porVideoPeriodo, porAnuncio);
  const videos30 = armarVideos(porVideo30, porAnuncio30);

  // Sugerencias y «en marcha»: siempre con los últimos 7 días, sin importar el periodo que se mira.
  const campanas7 = camp.map((c) => armar(c, porCampana7.get(c.id as string) ?? sinResultados()));
  // Lo que está en marcha (campañas activas que gastaron en 7 días): sobre eso se recomienda; lo apagado queda para consultar (25 nov 2026, pedido de Alcides).
  const enMarcha = calcularEnMarcha(campanas7.map((c) => ({ nombre: c.nombre, producto: c.producto, activa: c.activa, gasto7: c.r.gasto, creadaEn: c.creadaEn })), o.hoy);
  const idsEnMarcha = new Set(campanas7.filter((c) => campanaEnMarcha({ activa: c.activa, gasto7: c.r.gasto, creadaEn: c.creadaEn }, o.hoy)).map((c) => c.id));
  for (const c of campanas) c.enMarcha = idsEnMarcha.has(c.id);
  const videoEnMarcha = (v: VideoVista) => v.anunciosDetalle.some((a) => a.activo && idsEnMarcha.has(a.campanaId));
  for (const v of videos) v.enMarcha = videoEnMarcha(v);

  // Qué funciona: cada dimensión con las campañas (o anuncios) del periodo con gasto.
  // Con un producto elegido (`?producto=`), todo lo de «Qué funciona» sale solo de ese producto (23 nov 2026: los ángulos que funcionan dependen del producto).
  // Con un producto elegido manda ese; si no, `ver` recorta a lo que está en marcha (o a lo apagado): de un producto que sigue anunciándose cuentan todas sus campañas.
  const incluido = (producto: string | null, suyaEnMarcha: boolean) =>
    o.producto ? claveDeProducto(producto) === o.producto : !o.ver || enLaVista(suyaEnMarcha || productoEnMarcha(enMarcha, producto) ? "activo" : "apagado", o.ver);
  const conGasto = campanas.filter((c) => c.r.gasto > 0 && incluido(c.producto, !!c.enMarcha));
  const deCampana = (clave: (c: CampanaVista) => string | null): Elemento[] => conGasto.map((c) => ({ clave: clave(c), r: c.r, tope: c.tope, campana: c.id }));
  const deAnuncio = (clave: (a: AnuncioVista) => string | null): Elemento[] =>
    anuncios.filter((a) => a.r.gasto > 0 && incluido(campanasDe.get(a.campanaId)?.producto ?? null, !!campanasDe.get(a.campanaId)?.enMarcha)).map((a) => ({ clave: clave(a), r: a.r, tope: campanasDe.get(a.campanaId)?.tope ?? CPA_TOPE_PREDETERMINADO, campana: a.campanaId, video: a.videoId }));
  // Todo lo que la IA sacó de los videos se mide por video (lo que costó y vendió cada uno). El ángulo de una campaña es la mezcla de los de sus videos.
  const gruposVideo = gruposDeVideos(videos.filter((v) => incluido(v.producto, !!v.enMarcha)));
  const videosSinAngulo = gruposVideo.sinDato["Ángulo"];
  const grupos: GruposMeta = {
    campana: {
      "Ángulo": agrupar(deCampana((c) => c.angulo)).map((g) => {
        // De qué son los videos de las campañas clasificadas con esa táctica.
        const suyos = new Map(conGasto.filter((c) => c.angulo === g.nombre).flatMap((c) => (videosPorCampana.get(c.id) ?? []).map((v) => [v.videoId, v] as const)));
        const deQue = temasDe(g.nombre, [...suyos.values()].map((v) => ({ angulo: v.angulo, detalle: v.detalle, gasto: v.gasto, compras: 0 })));
        return deQue ? { ...g, deQue } : g;
      }),
      Estructura: agrupar(deCampana((c) => c.estructura)),
      Puja: agrupar(deCampana((c) => (c.puja ? NOMBRE_PUJA[c.puja] : null))),
      Producto: agrupar(deCampana((c) => c.producto)),
      Etapa: agrupar(deCampana((c) => (c.etapa ? NOMBRE_ETAPA[c.etapa] : null))),
    },
    anuncio: { Copy: agrupar(deAnuncio((a) => copyLimpio(a.copy))), Landing: agrupar(deAnuncio((a) => landingLimpia(a.landing))) },
  };

  // Sugerencias: siempre con los últimos 7 días de las campañas y 30 de los videos, sin importar el periodo que se mira.
  // La decisión de cada anuncio (escalera del documento «Métrica»): con lo acumulado en los últimos 30 días, las últimas 48 horas y el último día con datos.
  const ultimoDiaDe = (id: string): Resultados => {
    const dias = porAnuncioDia.get(id);
    if (!dias) return sinResultados();
    const fecha = [...dias.keys()].sort().pop();
    return fecha ? (dias.get(fecha) ?? sinResultados()) : sinResultados();
  };
  const anunciosSugerencia = anuncios.map((a) => ({ id: a.id, campanaId: a.campanaId, nombre: a.nombre, numero: a.numero, activo: a.activo, angulo: a.angulo, r: porAnuncio30.get(a.id) ?? sinResultados(), r7: porAnuncio7.get(a.id) ?? sinResultados(), ultimos2: porAnuncio2.get(a.id) ?? sinResultados(), ultimoDia: ultimoDiaDe(a.id), frecuencia: a.frecuencia }));
  const decisionesAnuncio = decisionesDeAnuncios(anunciosSugerencia, campanas);
  for (const a of anuncios) {
    const d = decisionesAnuncio.get(a.id);
    if (d) {
      a.decision = d.decision;
      a.decisionMotivo = d.motivo;
    }
  }
  // Además de lo que ve en los últimos días, el sistema sugiere lo que dice el historial completo (entrega, tendencias, lo que nunca funcionó); se aceptan o rechazan igual.
  // La landing de cada campaña, la de su anuncio con más gasto primero, con lo que se midió de ella (si ya se midió).
  const paginasMedidas = leerValorPaginas(valorDe(claveDePaginasMedidas(o.paisId)));
  const paginasPorCampana = new Map<string, { url: string; rasgos: string[] }[]>();
  for (const a of [...anuncios].sort((x, y) => (porAnuncio30.get(y.id)?.gasto ?? 0) - (porAnuncio30.get(x.id)?.gasto ?? 0))) {
    const url = landingLimpia(a.landing);
    if (!url || !paginasMedidas[url]) continue;
    const lista = paginasPorCampana.get(a.campanaId) ?? [];
    if (!lista.some((x) => x.url === url)) lista.push({ url, rasgos: paginasMedidas[url] });
    paginasPorCampana.set(a.campanaId, lista);
  }
  // En las sugerencias el ángulo va con su detalle, para que «antes y después» diga cuál.
  const videosEnMarcha = videos30.filter((v) => productoEnMarcha(enMarcha, v.producto)).map((v) => ({ ...v, angulo: nombreDeAngulo(v.angulo, v.analisis?.anguloDetalle) }));
  const delHistorial = hallazgosEnVista(hallazgosGuardados?.analisis.hallazgos ?? [], enMarcha, "activos");
  const todas = [...sugerir({ campanas: campanas7, anuncios: anunciosSugerencia, serie, videos: videosEnMarcha, hoy: o.hoy, paginasPorCampana }), ...sugerenciasDeHallazgos([...delHistorial, ...vigilancias.map(hallazgoDeVigilancia).filter((h): h is NonNullable<typeof h> => h !== null)])];
  const sugerencias = pendientes(todas, decisiones, o.hoy);
  // La misma prioridad en cada lista (25 nov 2026): lo más urgente de cada campaña, video y producto.
  const dePorCampana = pendientesPorCampana(sugerencias);
  for (const c of campanas) c.pendiente = dePorCampana.get(c.id) ?? null;
  const dePorVideo = pendientesPorVideo(sugerencias, videos);
  for (const v of videos) v.pendiente = dePorVideo.get(v.id) ?? null;
  const productosVista = agruparProductos(campanasConActividad, videos, enMarcha);
  for (const p of productosVista) p.pendiente = pendienteDeProducto(campanas.filter((c) => claveDeProducto(c.producto) === p.clave).map((c) => c.pendiente));

  // Campañas montadas por día (14 días) y por persona.
  const creadasPorDia = Array.from({ length: 14 }, (_, i) => ({ fecha: restar(o.hoy, 13 - i), testing: 0, venta: 0, escala: 0, retargeting: 0, otras: 0 }));
  for (const c of campanas) {
    const f = (c.creadaEn ?? "").slice(0, 10);
    const d = creadasPorDia.find((x) => x.fecha === f);
    if (d) d[c.etapa ?? "otras"]++;
  }
  // La actividad del equipo cuenta todas las cuentas juntas (las del país, o la que se haya elegido): 3 campañas en una cuenta y 3 el mismo día en otra son 6 ese día.
  const campanaDeMeta = new Map(camp.map((c) => [c.meta_id as string, c.id as string]));
  const creacionesEquipo: CreacionDeCampana[] = campanas.map((c) => ({ persona: c.persona, creadaEn: c.creadaEn, etapa: c.etapa ? NOMBRE_ETAPA[c.etapa] : null, estructura: c.estructura, puja: c.puja ? NOMBRE_PUJA[c.puja] : null, producto: c.producto, cuenta: c.cuentaNombre }));
  const eventosEquipo: EventoDeActividad[] = eventos.map((e) => ({ fecha: String(e.fecha), actor: (e.actor_nombre as string | null) ?? null, tipo: String(e.tipo), objetoTipo: (e.objeto_tipo as string | null) ?? null, objeto: (e.objeto_nombre as string | null) ?? null, detalle: (e.detalle as string | null) ?? null, cuenta: nombreCuenta.get(e.cuenta_id as string) ?? "", campanaId: campanaDeMeta.get(String(e.objeto_meta_id ?? "")) ?? null }));
  const actividad = resumirEquipo(creacionesEquipo, eventosEquipo, o.hoy, { maxReciente: 200 });
  const ganchosSinTipo = [...videosMapa.keys()].filter((id) => {
    const a = analisisDe.get(id);
    return !!a?.gancho && !a.ganchoTipo && a.estado !== "error";
  }).length;

  const serieGlobal: PuntoSerie[] = [];
  const paso = dias > 90 ? 7 : 1;
  for (let i = 0; i < dias; i += paso) {
    let gasto = 0;
    let compras = 0;
    for (let k = i; k < Math.min(dias, i + paso); k++) {
      const d = porDiaPeriodo.get(restar(desde, -k));
      gasto += d?.gasto ?? 0;
      compras += d?.compras ?? 0;
    }
    const fecha = restar(desde, -i);
    serieGlobal.push({ fecha, etiqueta: `${fecha.slice(8)}/${fecha.slice(5, 7)}`, gasto, compras });
  }
  const productos = [...new Set(camp.map((c) => (c.producto as string | null)?.trim()).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "es"));
  return {
    ...base, cuentas, cuentaId, desde, hasta: o.hoy, campanas: campanasConActividad, videos, anuncios, totales, anteriores, topes, productos, sugerencias, decididas: todas.length - sugerencias.length, grupos,
    interpretacion, analisisGeneradoEn: hallazgosGuardados?.generadoEn ?? null, analisisPendiente: analisisViejo(hallazgosGuardados), vigilancias, senales, rasgos, historial: hallazgosGuardados ? seccionesDeAnalisis(hallazgosGuardados) : null,
    serie: serieGlobal, gruposVideo, productosVista, enMarcha, creadasPorDia, creadasHoy: creadasPorDia[13]?.testing + creadasPorDia[13]?.venta + creadasPorDia[13]?.escala + creadasPorDia[13]?.retargeting + creadasPorDia[13]?.otras || 0, actividad, ganchosSinTipo, actividadDisponible: eventos.length > 0, videosSinAnalizar: videos.filter((v) => !v.analisis || v.analisis.estado !== "analizado" || v.analisis.version < VERSION_ANALISIS).length, videosSinAngulo, iaConectada: false,
  };
}

/** Lo que dice el registro de actividad sobre una campaña (la línea de tiempo de su ficha). */
export async function actividadDeCampana(supabase: SupabaseClient, campanaId: string): Promise<ActividadVista[]> {
  const { data: c } = await supabase.from("meta_campanas").select("meta_id, cuenta_id").eq("id", campanaId).maybeSingle();
  if (!c) return [];
  const { data } = await supabase.from("meta_actividad").select("fecha, actor_nombre, tipo, objeto_nombre, detalle").eq("cuenta_id", c.cuenta_id).eq("objeto_meta_id", c.meta_id).order("fecha", { ascending: false }).limit(40);
  return (data ?? []).map((e) => ({ fecha: e.fecha as string, actor: (e.actor_nombre as string | null) ?? null, tipo: e.tipo as string, objeto: (e.objeto_nombre as string | null) ?? null, detalle: detalleLegible(e.detalle as string | null) }));
}
