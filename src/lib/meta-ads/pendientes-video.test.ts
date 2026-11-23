import assert from "node:assert/strict";
import test from "node:test";
import { elegirParaAfinar, elegirPendientes, ESPERA_AFINAR_MS, ESPERA_AUTOMATICA, ESPERA_MANUAL_MS, type AnalisisGuardado, type AnuncioConVideo } from "./pendientes-video";

const ahora = Date.parse("2026-11-18T12:00:00Z");
const hace = (ms: number) => new Date(ahora - ms).toISOString();
const anuncio = (id: string, video: string, campana = "c1"): AnuncioConVideo => ({ id, cuenta_id: "cta", campana_id: campana, video_id: video, miniatura: null, copy: `copy ${id}`, titulo: null });
const base = (o: Partial<Parameters<typeof elegirPendientes>[0]>) =>
  elegirPendientes({ anuncios: [], gastoPorAnuncio: new Map(), analisis: new Map(), productoDe: new Map([["c1", "Producto"]]), ahora, manual: false, version: 2, max: 10, ...o });
const analisis = (...a: AnalisisGuardado[]) => new Map(a.map((x) => [x.video_id, x]));

test("cuenta todo el historial: un video con gasto viejo y sin análisis es pendiente; sin gasto nunca, no", () => {
  const r = base({ anuncios: [anuncio("a1", "v1"), anuncio("a2", "v2")], gastoPorAnuncio: new Map([["a1", 40]]) });
  assert.deepEqual(r.pendientes.map((p) => p.videoId), ["v1"]);
  assert.equal(r.total, 1);
});

test("de más a menos gasto, un video usado en varios anuncios suma todo y toma el texto del que más gastó", () => {
  const r = base({
    anuncios: [anuncio("a1", "v1"), anuncio("a2", "v1", "c2"), anuncio("a3", "v2")],
    gastoPorAnuncio: new Map([["a1", 10], ["a2", 30], ["a3", 35]]),
    productoDe: new Map([["c1", "Uno"], ["c2", "Dos"]]),
  });
  assert.deepEqual(r.pendientes.map((p) => [p.videoId, p.gasto]), [["v1", 40], ["v2", 35]]);
  assert.equal(r.pendientes[0].producto, "Dos");
  assert.equal(r.pendientes[0].copy, "copy a2");
  assert.equal(base({ anuncios: [anuncio("a1", "v1"), anuncio("a3", "v2")], gastoPorAnuncio: new Map([["a1", 10], ["a3", 35]]), max: 1 }).pendientes.length, 1);
});

test("lo analizado con la versión actual no vuelve; la versión vieja y los fallos sí, con su espera", () => {
  const anuncios = [anuncio("a1", "ok"), anuncio("a2", "viejo"), anuncio("a3", "texto"), anuncio("a4", "error")];
  const gastoPorAnuncio = new Map([["a1", 1], ["a2", 1], ["a3", 1], ["a4", 1]]);
  const hechos = (ms: number) => analisis({ video_id: "ok", estado: "analizado", analizado_en: hace(ms), version: 2 }, { video_id: "viejo", estado: "analizado", analizado_en: hace(ms), version: 1 }, { video_id: "texto", estado: "sin_archivo", analizado_en: hace(ms), version: 1 }, { video_id: "error", estado: "error", analizado_en: hace(ms) });
  // recién intentados: en automático no se repite nada, a mano tampoco (menos de 3 minutos)
  assert.equal(base({ anuncios, gastoPorAnuncio, analisis: hechos(60_000) }).total, 0);
  assert.equal(base({ anuncios, gastoPorAnuncio, analisis: hechos(60_000), manual: true }).total, 0);
  // hace 10 minutos: a mano se repiten los tres no completos; en automático todavía no
  assert.deepEqual(base({ anuncios, gastoPorAnuncio, analisis: hechos(10 * 60_000), manual: true }).pendientes.map((p) => p.videoId).sort(), ["error", "texto", "viejo"]);
  assert.equal(base({ anuncios, gastoPorAnuncio, analisis: hechos(10 * 60_000) }).total, 0);
  // siete horas: en automático vuelve solo el «solo texto» (seis horas: solo mira si Meta ya da el archivo); el error y la versión vieja esperan un día
  assert.deepEqual(base({ anuncios, gastoPorAnuncio, analisis: hechos(ESPERA_AUTOMATICA.sin_archivo + 3_600_000) }).pendientes.map((p) => p.videoId), ["texto"]);
  // más de un día: vuelven los tres
  assert.deepEqual(base({ anuncios, gastoPorAnuncio, analisis: hechos(ESPERA_AUTOMATICA.error + 3_600_000) }).pendientes.map((p) => p.videoId).sort(), ["error", "texto", "viejo"]);
  assert.ok(ESPERA_MANUAL_MS < ESPERA_AUTOMATICA.sin_archivo && ESPERA_AUTOMATICA.sin_archivo < ESPERA_AUTOMATICA.error);
});

test("el reanálisis del ángulo toma los analizados con la regla vieja, de más a menos gasto, y no toca lo manual ni lo que falta analizar por completo", () => {
  const anuncios = [anuncio("a1", "v2"), anuncio("a2", "v3"), anuncio("a3", "manual"), anuncio("a4", "v1"), anuncio("a5", "v2b"), anuncio("a6", "texto")];
  const gastoPorAnuncio = new Map([["a1", 10], ["a2", 99], ["a3", 50], ["a4", 60], ["a5", 70], ["a6", 80]]);
  const hechos = analisis(
    { video_id: "v2", estado: "analizado", analizado_en: hace(86_400_000), version: 2 },
    { video_id: "v3", estado: "analizado", analizado_en: hace(86_400_000), version: 3 },
    { video_id: "manual", estado: "analizado", analizado_en: hace(86_400_000), version: 2, angulo_manual: true },
    { video_id: "v1", estado: "analizado", analizado_en: hace(86_400_000), version: 1 },
    { video_id: "v2b", estado: "analizado", analizado_en: hace(86_400_000), version: 2 },
    { video_id: "texto", estado: "sin_archivo", analizado_en: hace(86_400_000), version: 1 },
  );
  const r = elegirParaAfinar({ anuncios, gastoPorAnuncio, analisis: hechos, productoDe: new Map(), ahora, manual: false, version: 3, versionMinima: 2, max: 10 });
  assert.deepEqual(r.pendientes.map((p) => p.videoId), ["v2b", "v2"]);
  assert.equal(r.total, 2);
});

test("un reanálisis del ángulo que falló no se repite en cada pasada: espera seis horas (a mano, tres minutos)", () => {
  const anuncios = [anuncio("a1", "v2")];
  const gastoPorAnuncio = new Map([["a1", 10]]);
  const fallo = (ms: number) => analisis({ video_id: "v2", estado: "analizado", analizado_en: hace(ms), version: 2, error: "Reanálisis del ángulo: Meta no entregó el archivo del video." });
  const e = (ms: number, manual = false) => elegirParaAfinar({ anuncios, gastoPorAnuncio, analisis: fallo(ms), productoDe: new Map(), ahora, manual, version: 3, versionMinima: 2, max: 10 }).total;
  assert.equal(e(60 * 60_000), 0);
  assert.equal(e(ESPERA_AFINAR_MS + 60_000), 1);
  assert.equal(e(10 * 60_000, true), 1);
  assert.equal(e(60_000, true), 0);
});
