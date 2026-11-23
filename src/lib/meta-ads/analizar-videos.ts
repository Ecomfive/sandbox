// Anuncios Meta › analizar los videos con IA (18 nov 2026): baja el video de Meta (solo de su red de archivos), se lo muestra a Gemini y guarda el ángulo, la promesa, el gancho, lo que dice y a quién le habla en
// `meta_video_analisis`. Si Meta no deja bajar el archivo (puede faltar el permiso de la API), se analiza solo el texto del anuncio y su miniatura y el ángulo queda como provisional (`sin_archivo`).
// Solo lee de Meta y escribe aquí; nunca cambia nada en Meta. Los videos que más gastaron se analizan primero.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { pedirMeta, tokenDeMeta } from "./api";
import { buscarArchivoDeVideo, motivoSinArchivoDeVideo } from "./archivo-video";
import { analizarSoloTextoConGemini, analizarVideoConGemini, geminiConectado } from "./gemini-video";
import { elegirParaAfinar, elegirPendientes, type AnalisisGuardado, type AnuncioConVideo, type VideoPendiente } from "./pendientes-video";
import { esAnguloVago, esHostDeVideoMeta, normalizarAnalisisVideo, pedidoAnalisisVideo, pedidoSoloAngulo, VERSION_ANALISIS, VERSION_ANGULO, type AnalisisVideo } from "./video-angulo";

const MAX_BYTES_VIDEO = 80 * 1024 * 1024;
const MAX_BYTES_IMAGEN = 3 * 1024 * 1024;
const DIA = 86_400_000;

export type { VideoPendiente };

export interface ResultadoVideo {
  ok: boolean;
  estado: "analizado" | "sin_archivo" | "error";
  mensaje: string;
}

const hoyMenos = (dias: number) => new Date(Date.now() - dias * DIA).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/**
 * Los videos que le tocan a la IA (de más a menos gasto): con gasto en **todo el historial leído** (no solo los últimos 30 días) y sin análisis, con el intento fallido, analizados solo con el texto o con un análisis de una
 * versión anterior (reglas en `elegirPendientes`). El gasto sale de `meta_gasto_por_anuncio` (migración 0327); sin ella se cuentan los últimos 30 días, como antes. El cron espera de uno a tres días antes de repetir
 * un intento; cuando una persona pulsa «Analizar los pendientes» (`ahora: true`) se repiten al momento, salvo lo intentado hace menos de 3 minutos.
 */
export async function videosPorAnalizar(supabase: SupabaseClient, opciones: { max: number; ahora?: boolean }): Promise<{ pendientes: VideoPendiente[]; total: number; afinar: { pendientes: VideoPendiente[]; total: number } }> {
  const { data: cuentas } = await supabase.from("meta_cuentas").select("id").eq("activa", true);
  const ids = (cuentas ?? []).map((c) => c.id as string);
  if (!ids.length) return { pendientes: [], total: 0, afinar: { pendientes: [], total: 0 } };
  const gastoTotal = async (): Promise<Map<string, number>> => {
    const m = new Map<string, number>();
    try {
      const filas = await traerTodasLasFilas<{ anuncio_id: string; gasto: unknown }>((a, b) => supabase.rpc("meta_gasto_por_anuncio", { p_cuentas: ids }).range(a, b));
      for (const f of filas) m.set(f.anuncio_id, Number(f.gasto) || 0);
      return m;
    } catch {
      const filas = await traerTodasLasFilas<{ anuncio_id: string; gasto: unknown }>((a, b) => supabase.from("meta_resultados_dia").select("anuncio_id, gasto").in("cuenta_id", ids).gte("fecha", hoyMenos(29)).range(a, b));
      for (const f of filas) m.set(f.anuncio_id, (m.get(f.anuncio_id) ?? 0) + (Number(f.gasto) || 0));
      return m;
    }
  };
  const [anuncios, gastoPorAnuncio, hechos, campanas] = await Promise.all([
    traerTodasLasFilas<AnuncioConVideo>((a, b) => supabase.from("meta_anuncios").select("id, cuenta_id, campana_id, video_id, miniatura, copy, titulo").in("cuenta_id", ids).not("video_id", "is", null).range(a, b)),
    gastoTotal(),
    traerTodasLasFilas<AnalisisGuardado>((a, b) => supabase.from("meta_video_analisis").select("video_id, estado, analizado_en, version, error, angulo_manual").range(a, b)).catch(() =>
      traerTodasLasFilas<AnalisisGuardado>((a, b) => supabase.from("meta_video_analisis").select("video_id, estado, analizado_en").range(a, b)),
    ),
    traerTodasLasFilas<{ id: string; producto: string | null }>((a, b) => supabase.from("meta_campanas").select("id, producto").in("cuenta_id", ids).range(a, b)),
  ]);
  const entrada = { anuncios, gastoPorAnuncio, analisis: new Map(hechos.map((h) => [h.video_id, h])), productoDe: new Map(campanas.map((c) => [c.id, c.producto])), ahora: Date.now(), manual: !!opciones.ahora, max: opciones.max };
  // Primero lo que falta analizar por completo (sin análisis, con fallo, solo con el texto o de una versión sin estructura); después, el reanálisis solo del ángulo de lo ya analizado.
  return { ...elegirPendientes({ ...entrada, version: VERSION_ANALISIS }), afinar: elegirParaAfinar({ ...entrada, version: VERSION_ANGULO, versionMinima: VERSION_ANALISIS }) };
}

/** El contexto de un video concreto (para «Analizar con IA» o «Volver a analizar» en su ficha): el anuncio que más lo usa, su texto y el producto de su campaña. */
export async function pendienteDeVideo(supabase: SupabaseClient, videoId: string): Promise<VideoPendiente | null> {
  const { data: anuncios } = await supabase.from("meta_anuncios").select("id, cuenta_id, campana_id, miniatura, copy, titulo").eq("video_id", videoId);
  if (!anuncios?.length) return null;
  const { data: filas } = await supabase.from("meta_resultados_dia").select("anuncio_id, gasto").in("anuncio_id", anuncios.map((a) => a.id as string));
  const gastoDe = new Map<string, number>();
  for (const f of filas ?? []) gastoDe.set(f.anuncio_id as string, (gastoDe.get(f.anuncio_id as string) ?? 0) + (Number(f.gasto) || 0));
  const mejor = [...anuncios].sort((a, b) => (gastoDe.get(b.id as string) ?? 0) - (gastoDe.get(a.id as string) ?? 0))[0];
  const { data: campana } = await supabase.from("meta_campanas").select("producto").eq("id", mejor.campana_id as string).maybeSingle();
  return { videoId, cuentaId: mejor.cuenta_id as string, gasto: [...gastoDe.values()].reduce((x, y) => x + y, 0), producto: (campana?.producto as string | null) ?? null, copy: (mejor.copy as string | null) ?? null, titulo: (mejor.titulo as string | null) ?? null, miniatura: (mejor.miniatura as string | null) ?? anuncios.find((a) => a.miniatura)?.miniatura ?? null };
}

async function leerLimitado(r: Response, max: number): Promise<Uint8Array | null> {
  const largo = Number(r.headers.get("content-length") ?? 0);
  if (largo > max) return null;
  const lector = r.body?.getReader();
  if (!lector) return null;
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    bytes.set(p, i);
    i += p.byteLength;
  }
  return bytes;
}

/** Baja un archivo de la red de Meta (nada más): ni una dirección ajena ni una redirección a otro sitio. */
async function bajarDeMeta(url: string, max: number, esperaMs: number): Promise<{ bytes: Uint8Array; tipo: string } | null> {
  if (!esHostDeVideoMeta(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(esperaMs) });
    if (!r.ok || !esHostDeVideoMeta(r.url)) return null;
    const bytes = await leerLimitado(r, max);
    return bytes && bytes.byteLength > 0 ? { bytes, tipo: (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() } : null;
  } catch {
    return null;
  }
}

async function angulosExistentes(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("meta_video_analisis").select("angulo").not("angulo", "is", null).limit(500);
  return [...new Set((data ?? []).map((d) => d.angulo as string).filter(Boolean))];
}

/** Analiza un video y guarda el resultado. Nunca lanza; lo que pasó se dice en `mensaje`. */
export async function analizarVideoDeMeta(supabase: SupabaseClient, v: VideoPendiente, quien: string | null): Promise<ResultadoVideo> {
  const token = tokenDeMeta();
  if (!token) return { ok: false, estado: "error", mensaje: "Falta el acceso a Meta (META_ADS_ACCESS_TOKEN)." };
  if (!geminiConectado()) return { ok: false, estado: "error", mensaje: "Falta conectar Gemini (la clave GEMINI_API_KEY) para analizar videos." };
  const existentes = await angulosExistentes(supabase);
  const contexto = { operacion: "meta_video_angulo", modulo: "anuncios-meta", referencia: v.videoId };
  const { data: previo } = await supabase.from("meta_video_analisis").select("angulo, angulo_manual, estado").eq("video_id", v.videoId).maybeSingle();

  // 1. El archivo del video: Meta lo entrega como una dirección temporal en el campo `source` (solo si el acceso lo permite).
  const archivoDeVideo = await buscarArchivoDeVideo(supabase, token, v.videoId, v.cuentaId);
  const fuente = archivoDeVideo.fuente;
  const duracion = archivoDeVideo.duracion;
  let motivoSinArchivo: string | null = null;
  if (!fuente) {
    // Qué permisos tiene de verdad el acceso, para saber qué falta, y de qué cuenta es el video.
    const permisos = archivoDeVideo.ficha.ok ? await pedirMeta("/me/permissions", {}, token) : null;
    const dados = permisos?.ok ? ((permisos.datos as { data?: Array<{ permission?: string; status?: string }> }).data ?? []).filter((p) => p.status === "granted").map((p) => p.permission).filter(Boolean).join(", ") : "";
    const { data: cuentaDelVideo } = await supabase.from("meta_cuentas").select("nombre").eq("id", v.cuentaId).maybeSingle();
    motivoSinArchivo = motivoSinArchivoDeVideo(archivoDeVideo, (cuentaDelVideo?.nombre as string | undefined) ?? null, dados);
  }
  // Ya estaba analizado solo con el texto y Meta sigue sin dar el archivo: no se vuelve a pagar a la IA para repetir el mismo análisis; solo se anota el intento (y el motivo) para volver a mirar más tarde.
  if (!fuente && previo?.estado === "sin_archivo") {
    await supabase.from("meta_video_analisis").update({ analizado_en: new Date().toISOString(), error: (motivoSinArchivo ?? "Meta no entregó el archivo del video.").slice(0, 300) }).eq("video_id", v.videoId);
    return { ok: true, estado: "sin_archivo", mensaje: `Sigue sin el archivo de Meta: ${motivoSinArchivo ?? "no lo entregó"}` };
  }

  let origen: "video" | "texto" = "video";
  let motivo = motivoSinArchivo;
  let respuesta: Awaited<ReturnType<typeof analizarVideoConGemini>> | null = null;
  let analisisDelVideo: AnalisisVideo | null = null;
  if (fuente) {
    const archivo = await bajarDeMeta(fuente, MAX_BYTES_VIDEO, 60_000);
    if (!archivo) motivo = "No se pudo bajar el video de Meta (o pesa más de 80 MB).";
    else {
      respuesta = await analizarVideoConGemini(archivo.bytes, archivo.tipo.startsWith("video/") ? archivo.tipo : "video/mp4", pedidoAnalisisVideo({ producto: v.producto, copy: v.copy, titulo: v.titulo, angulosExistentes: existentes, soloTexto: false }), contexto);
      // «Recitation»: Gemini cortó la respuesta porque iba a repetir de memoria algo que reconoce (la letra de una canción, un texto famoso, la transcripción). Se repite el mismo video sin pedir transcripción y con más temperatura.
      if ("error" in respuesta && /RECITATION/.test(respuesta.error)) {
        respuesta = await analizarVideoConGemini(archivo.bytes, archivo.tipo.startsWith("video/") ? archivo.tipo : "video/mp4", pedidoAnalisisVideo({ producto: v.producto, copy: v.copy, titulo: v.titulo, angulosExistentes: existentes, soloTexto: false, sinTranscribir: true }), contexto, 0.7);
      }
      // Gemini contestó pero no se puede usar (cortada, sin ángulo): se pide de nuevo sin transcripción, que es lo que más largo se hace, y con otra temperatura.
      if ("texto" in respuesta) {
        analisisDelVideo = normalizarAnalisisVideo(respuesta.texto, existentes);
        if (!analisisDelVideo) {
          const primera = respuesta.texto;
          const otra = await analizarVideoConGemini(archivo.bytes, archivo.tipo.startsWith("video/") ? archivo.tipo : "video/mp4", pedidoAnalisisVideo({ producto: v.producto, copy: v.copy, titulo: v.titulo, angulosExistentes: existentes, soloTexto: false, sinTranscribir: true }), contexto, 0.5);
          if ("texto" in otra) {
            analisisDelVideo = normalizarAnalisisVideo(otra.texto, existentes);
            if (analisisDelVideo) respuesta = otra;
          }
          if (!analisisDelVideo) {
            motivo = `La IA contestó, pero no se pudo leer (${primera.length} letras: «${primera.replace(/\s+/g, " ").slice(0, 70)}»).`;
            respuesta = null;
          }
        }
      }
      // Si Gemini no pudo con el video, no se deja el video en error: se analiza con el texto y la miniatura (provisional) y el motivo queda dicho en la ficha.
      if (respuesta && "error" in respuesta) {
        motivo = `${respuesta.error}`;
        respuesta = null;
      }
    }
  }

  // 2. Sin video: el texto del anuncio y su miniatura, con el ángulo provisional.
  if (!respuesta) {
    origen = "texto";
    const mini = v.miniatura ? await bajarDeMeta(v.miniatura, MAX_BYTES_IMAGEN, 15_000) : null;
    const tipo = mini?.tipo.startsWith("image/") ? mini.tipo : "image/jpeg";
    respuesta = await analizarSoloTextoConGemini(pedidoAnalisisVideo({ producto: v.producto, copy: v.copy, titulo: v.titulo, angulosExistentes: existentes, soloTexto: true }), mini ? { bytes: mini.bytes, mime: tipo } : null, contexto);
  }

  const analisis: AnalisisVideo | null = analisisDelVideo ?? ("texto" in respuesta ? normalizarAnalisisVideo(respuesta.texto, existentes) : null);
  const modelo = "modelo" in respuesta ? respuesta.modelo : null;
  if (!analisis) {
    const error = "error" in respuesta ? respuesta.error : `La IA no devolvió un análisis que se pueda usar (${respuesta.texto.length} letras: «${respuesta.texto.replace(/\s+/g, " ").slice(0, 70)}»).`;
    await supabase.from("meta_video_analisis").upsert({ video_id: v.videoId, cuenta_id: v.cuentaId, estado: "error", origen, error: `${motivo ? `${motivo} ` : ""}${error}`.slice(0, 300), modelo, analizado_por: quien, analizado_en: new Date().toISOString(), duracion_s: duracion }, { onConflict: "video_id" });
    return { ok: false, estado: "error", mensaje: error };
  }
  // Un video que ya se analizó viéndolo no se pisa con un análisis solo con el texto (si Meta hoy no entrega el archivo): se conserva el ángulo bueno y se anota el intento (así el reanálisis no empeora lo que ya había).
  if (origen === "texto" && previo?.estado === "analizado") {
    await supabase.from("meta_video_analisis").update({ analizado_en: new Date().toISOString() }).eq("video_id", v.videoId);
    return { ok: false, estado: "error", mensaje: `No se pudo volver a ver el video (${motivo ?? "Meta no entregó el archivo"}): se conserva el ángulo de antes.` };
  }
  const manual = !!previo?.angulo_manual;
  const estado = origen === "video" ? "analizado" : "sin_archivo";
  const base = { video_id: v.videoId, cuenta_id: v.cuentaId, estado, origen, angulo: manual ? ((previo?.angulo as string | null) ?? analisis.angulo) : analisis.angulo, angulo_manual: manual, promesa: analisis.promesa || null, gancho: analisis.gancho || null, resumen: analisis.resumen || null, transcripcion: analisis.transcripcion || null, publico: analisis.publico || null, formato: analisis.formato, duracion_s: duracion, modelo, error: estado === "sin_archivo" ? (motivo ?? "").slice(0, 300) || null : null, analizado_por: quien, analizado_en: new Date().toISOString() };
  // Un análisis sin video (solo texto) no trae estructura ni segundos: queda en la versión 1 para volver a verlo cuando Meta dé el archivo.
  // Si el ángulo salió vago («Beneficios clave»), se guarda un grado menos de la versión del ángulo y con el motivo: la cola de «solo el ángulo» lo vuelve a pedir más tarde.
  const vago = origen === "video" && !manual && esAnguloVago(analisis.angulo);
  const completo = { ...base, angulo_detalle: analisis.anguloDetalle || null, error: vago ? `Reanálisis del ángulo: salió vago («${analisis.angulo}»).` : null, gancho_tipo: analisis.ganchoTipo, version: origen === "video" ? (vago ? VERSION_ANGULO - 1 : VERSION_ANGULO) : 1, cta: analisis.cta || null, cta_segundo: analisis.ctaSegundo, cta_tipo: analisis.ctaTipo || null, oferta: analisis.oferta || null, recursos: analisis.recursos, estructura: analisis.estructura };
  let { error } = await supabase.from("meta_video_analisis").upsert(completo, { onConflict: "video_id" });
  // Sin la migración 0357 no existe el detalle del ángulo: se guarda lo demás igual.
  if (error && /angulo_detalle/i.test(error.message)) {
    const { angulo_detalle: _d, ...sinDetalle } = completo;
    void _d;
    // Sin subir la versión del ángulo (queda una menos): se vuelve a pedir, con su detalle, cuando la migración esté.
    ({ error } = await supabase.from("meta_video_analisis").upsert({ ...sinDetalle, error: "Reanálisis del ángulo: falta correr la migración 0357 (detalle del ángulo).", version: origen === "video" ? VERSION_ANGULO - 1 : 1 }, { onConflict: "video_id" }));
  }
  // Sin la migración 0326 se guarda lo de antes.
  if (error && /cta|oferta|recursos|estructura|version|gancho_tipo|schema cache/i.test(error.message)) ({ error } = await supabase.from("meta_video_analisis").upsert(base, { onConflict: "video_id" }));
  if (error) return { ok: false, estado: "error", mensaje: /meta_video_analisis|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 0325 (ángulo de los videos) en Supabase." : error.message };
  return { ok: true, estado, mensaje: estado === "analizado" ? `Ángulo: ${analisis.angulo}.` : `Ángulo provisional «${analisis.angulo}» (solo con el texto: ${motivo ?? "Meta no entregó el video"}).` };
}

/**
 * Vuelve a pedir **solo el ángulo** de un video que ya estaba analizado (23 nov 2026, pedido de Alcides): con la regla nueva —específico y sacado únicamente de lo que se ve y se dice en el video— y sin tocar nada más del
 * análisis (estructura, llamado a la acción, transcripción). Si Meta hoy no entrega el archivo o la IA no contesta, se conserva el ángulo de antes y se anota el intento. Un ángulo corregido a mano no se reanaliza.
 */
export async function afinarAnguloDeVideo(supabase: SupabaseClient, v: VideoPendiente, quien: string | null): Promise<ResultadoVideo> {
  const token = tokenDeMeta();
  if (!token) return { ok: false, estado: "error", mensaje: "Falta el acceso a Meta (META_ADS_ACCESS_TOKEN)." };
  if (!geminiConectado()) return { ok: false, estado: "error", mensaje: "Falta conectar Gemini (la clave GEMINI_API_KEY) para analizar videos." };
  const { data: previo } = await supabase.from("meta_video_analisis").select("angulo, angulo_manual, estado").eq("video_id", v.videoId).maybeSingle();
  if (!previo || previo.estado !== "analizado") return { ok: false, estado: "error", mensaje: "Ese video no tiene un análisis completo que afinar." };
  const ahora = new Date().toISOString();
  if (previo.angulo_manual) {
    await supabase.from("meta_video_analisis").update({ version: VERSION_ANGULO }).eq("video_id", v.videoId);
    return { ok: true, estado: "analizado", mensaje: "El ángulo está corregido a mano: no se reanaliza." };
  }
  const falla = async (mensaje: string): Promise<ResultadoVideo> => {
    await supabase.from("meta_video_analisis").update({ analizado_en: ahora, error: `Reanálisis del ángulo: ${mensaje}`.slice(0, 300) }).eq("video_id", v.videoId);
    return { ok: false, estado: "error", mensaje: `${mensaje} Se conserva el ángulo de antes.` };
  };
  const archivoDeVideo = await buscarArchivoDeVideo(supabase, token, v.videoId, v.cuentaId);
  if (!archivoDeVideo.fuente) return falla("Meta no entregó el archivo del video.");
  const archivo = await bajarDeMeta(archivoDeVideo.fuente, MAX_BYTES_VIDEO, 60_000);
  if (!archivo) return falla("No se pudo bajar el video de Meta (o pesa más de 80 MB).");
  const existentes = await angulosExistentes(supabase);
  const contexto = { operacion: "meta_video_angulo", modulo: "anuncios-meta", referencia: v.videoId };
  const mime = archivo.tipo.startsWith("video/") ? archivo.tipo : "video/mp4";
  const respuesta = await analizarVideoConGemini(archivo.bytes, mime, pedidoSoloAngulo({ producto: v.producto, angulosExistentes: existentes }), contexto);
  if ("error" in respuesta) return falla(respuesta.error);
  let analisis = normalizarAnalisisVideo(respuesta.texto, existentes);
  if (!analisis) return falla("La IA no devolvió un ángulo que se pueda usar.");
  let modelo = respuesta.modelo;
  // Un ángulo vago («Beneficios clave») se vuelve a pedir una vez, diciéndole a la IA que el suyo no sirve; si sigue igual, se conserva el de antes y se vuelve a intentar más tarde (las tandas siguientes).
  if (esAnguloVago(analisis.angulo)) {
    const otra = await analizarVideoConGemini(archivo.bytes, mime, pedidoSoloAngulo({ producto: v.producto, angulosExistentes: existentes, vagoAnterior: analisis.angulo }), contexto, 0.7);
    const segundo = "texto" in otra ? normalizarAnalisisVideo(otra.texto, existentes) : null;
    if (!segundo || esAnguloVago(segundo.angulo)) return falla(`El ángulo sigue siendo vago («${analisis.angulo}»).`);
    analisis = segundo;
    modelo = "modelo" in otra ? otra.modelo : modelo;
  }
  const cambios = { angulo: analisis.angulo, angulo_detalle: analisis.anguloDetalle || null, version: VERSION_ANGULO, error: null, analizado_en: ahora, modelo, analizado_por: quien };
  let { error } = await supabase.from("meta_video_analisis").update(cambios).eq("video_id", v.videoId);
  // Sin la migración 0357 no existe el detalle del ángulo: se guarda el ángulo, pero sin subir la versión, para que se vuelva a pedir (con su detalle) cuando la migración esté.
  if (error && /angulo_detalle|schema cache/i.test(error.message)) {
    // Y se anota el intento (hora y motivo) para que la cola espere 6 horas en vez de repetir siempre los mismos videos mientras falta la migración.
    const { angulo_detalle: _d, version: _v, ...sinDetalle } = { ...cambios, error: "Reanálisis del ángulo: falta correr la migración 0357 (detalle del ángulo)." };
    void [_d, _v];
    ({ error } = await supabase.from("meta_video_analisis").update(sinDetalle).eq("video_id", v.videoId));
  }
  if (error) return { ok: false, estado: "error", mensaje: error.message };
  const antes = (previo.angulo as string | null) ?? "—";
  return { ok: true, estado: "analizado", mensaje: antes === analisis.angulo ? `Ángulo: ${analisis.angulo} (sigue igual).` : `Ángulo: ${antes} → ${analisis.angulo}.` };
}

/**
 * Analiza los pendientes más gastadores uno tras otro mientras quede tiempo. La usan el cron y «Analizar los pendientes». Primero lo que falta analizar por completo; cuando eso se acaba, sigue **solo** con el reanálisis del
 * ángulo de lo ya analizado (`afinados`), sin que nadie lo pida.
 */
export async function analizarPendientes(supabase: SupabaseClient, opciones: { limiteMs: number; max?: number; quien?: string | null; ahora?: boolean }): Promise<{ analizados: number; sinArchivo: number; errores: number; faltan: number; afinados: number; faltanAfinar: number; mensajes: string[] }> {
  const inicio = Date.now();
  const r = { analizados: 0, sinArchivo: 0, errores: 0, faltan: 0, afinados: 0, faltanAfinar: 0, mensajes: [] as string[] };
  const max = opciones.max ?? 12;
  const { pendientes, total, afinar } = await videosPorAnalizar(supabase, { max, ahora: opciones.ahora });
  r.faltan = total;
  r.faltanAfinar = afinar.total;
  // Un video tarda de 20 a 90 segundos: no se empieza otro si ya no cabe.
  const cabe = () => Date.now() - inicio <= opciones.limiteMs - 100_000;
  let hechos = 0;
  for (const v of pendientes) {
    if (!cabe()) break;
    const x = await analizarVideoDeMeta(supabase, v, opciones.quien ?? null);
    hechos++;
    if (x.estado === "analizado") r.analizados++;
    else if (x.estado === "sin_archivo") r.sinArchivo++;
    else {
      r.errores++;
      r.mensajes.push(x.mensaje);
    }
    r.faltan = Math.max(0, r.faltan - 1);
    // Un fallo de configuración se repetiría con todos: se corta.
    if (!x.ok && /Falta (el acceso|conectar)/.test(x.mensaje)) return r;
  }
  // Ya no queda nada por analizar por completo: se sigue con el ángulo de los que ya estaban analizados.
  if (r.faltan === 0 && hechos < max) {
    for (const v of afinar.pendientes.slice(0, max - hechos)) {
      if (!cabe()) break;
      const x = await afinarAnguloDeVideo(supabase, v, opciones.quien ?? null);
      if (x.ok) r.afinados++;
      else {
        r.errores++;
        r.mensajes.push(x.mensaje);
      }
      r.faltanAfinar = Math.max(0, r.faltanAfinar - 1);
      if (!x.ok && /Falta (el acceso|conectar)/.test(x.mensaje)) break;
    }
  }
  return r;
}
