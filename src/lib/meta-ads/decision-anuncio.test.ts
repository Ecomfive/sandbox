import assert from "node:assert/strict";
import test from "node:test";
import { decisionDeAnuncio, decisionesDeAnuncios, type EntradaDecision } from "./decision-anuncio";
import { nivelesDeMetricas, sinResultados, type Resultados } from "./metricas";

const r = (p: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...p });
const entrada = (acumulado: Partial<Resultados>, o: Partial<EntradaDecision> = {}): EntradaDecision => ({ acumulado: r(acumulado), ultimos2: sinResultados(), ultimoDia: sinResultados(), presupuestoCampana: null, esCbo: true, hayOtroConCpaBajo: false, ...o });
// CTR del enlace: clics ÷ impresiones; Hook: video de 3 s ÷ impresiones.
const clics = (ctrPct: number, extra: Partial<Resultados> = {}): Partial<Resultados> => ({ impresiones: 1000, clics: ctrPct * 10, ...extra });

test("de $8 a $12 sin compras: con CTR bajo de 1.20 % se corta; con CTR de 2 % y Hook de 30 % se mantiene; en medio, todavía nada", () => {
  assert.equal(decisionDeAnuncio(entrada(clics(1, { gasto: 9 })))?.decision, "cortar");
  assert.equal(decisionDeAnuncio(entrada(clics(2.5, { gasto: 9, video3s: 350 })))?.decision, "mantener");
  assert.equal(decisionDeAnuncio(entrada(clics(1.6, { gasto: 9 }))), null);
  assert.equal(decisionDeAnuncio(entrada(clics(2.5, { gasto: 5 }))), null);
});

test("con $12 o más sin una compra se corta aunque el CTR y el Hook estén en verde", () => {
  const d = decisionDeAnuncio(entrada(clics(4, { gasto: 13, video3s: 500 })));
  assert.equal(d?.decision, "cortar");
  assert.match(d?.motivo ?? "", /tráfico curioso/);
});

test("una compra con CPA de $12.01 a $16 y CTR de 2 % se observa hasta $25; con $25 y el CPA arriba de $12 se corta", () => {
  assert.equal(decisionDeAnuncio(entrada(clics(2.5, { gasto: 14, compras: 1, valor: 30 })))?.decision, "observar");
  assert.equal(decisionDeAnuncio(entrada(clics(2.5, { gasto: 26, compras: 2, valor: 60 })))?.decision, "cortar");
  assert.equal(decisionDeAnuncio(entrada(clics(2.5, { gasto: 26, compras: 3, valor: 90 }))), null);
});

test("dos o más compras con CPA hasta $9.50 y ROAS de 3.5 se consolidan", () => {
  assert.equal(decisionDeAnuncio(entrada(clics(3, { gasto: 25, compras: 3, valor: 100 })))?.decision, "consolidar");
  assert.equal(decisionDeAnuncio(entrada(clics(3, { gasto: 25, compras: 3, valor: 60 }))), null);
});

test("un ganador que se desgasta rota el gancho: más de $35, el CTR cae más de 25 % y el CPA de 48 h pasa de $12", () => {
  const e = entrada({ ...clics(3, { gasto: 60, compras: 8, valor: 300 }) }, { ultimos2: r({ impresiones: 500, clics: 7, gasto: 20, compras: 1 }) });
  assert.equal(decisionDeAnuncio(e)?.decision, "rotar");
  // Si el CTR no cayó, no rota.
  assert.notEqual(decisionDeAnuncio(entrada({ ...clics(3, { gasto: 60, compras: 8, valor: 300 }) }, { ultimos2: r({ impresiones: 500, clics: 15, gasto: 20, compras: 1 }) }))?.decision, "rotar");
});

test("rebalancear (opcional): un anuncio de la CBO se come más del 60 % del presupuesto con CPA de $11 a $12 mientras otro rinde mejor", () => {
  const base = { ...clics(3, { gasto: 60, compras: 5, valor: 150 }) };
  const d = decisionDeAnuncio(entrada(base, { presupuestoCampana: 40, ultimoDia: r({ gasto: 33, compras: 3 }), hayOtroConCpaBajo: true }));
  assert.equal(d?.decision, "rebalancear");
  assert.notEqual(decisionDeAnuncio(entrada(base, { presupuestoCampana: 40, ultimoDia: r({ gasto: 33, compras: 3 }), hayOtroConCpaBajo: false }))?.decision, "rebalancear");
  assert.notEqual(decisionDeAnuncio(entrada(base, { esCbo: false, presupuestoCampana: 40, ultimoDia: r({ gasto: 33, compras: 3 }), hayOtroConCpaBajo: true }))?.decision, "rebalancear");
});

test("solo se decide sobre anuncios activos de campañas activas", () => {
  const campanas = [{ id: "c1", activa: true, presupuestoDiario: 40, estructura: "CBO" }, { id: "c2", activa: false, presupuestoDiario: 40, estructura: "CBO" }];
  const a = (id: string, campanaId: string, activo: boolean) => ({ id, campanaId, activo, r: r({ gasto: 20 }), ultimos2: sinResultados(), ultimoDia: sinResultados() });
  const m = decisionesDeAnuncios([a("x1", "c1", true), a("x2", "c1", false), a("x3", "c2", true)], campanas);
  assert.deepEqual([...m.keys()], ["x1"]);
});

test("las escalas de ventas del documento «Métrica»: CPA, CTR, CPM, Hook, efectividad y conversión", () => {
  // CPM $4, CTR 3.5 %, Hook 45 %, efectividad 90 % (visitas ÷ clics), CVR 2 % (compras ÷ visitas), CPA $8.
  const bueno = nivelesDeMetricas(r({ gasto: 80, impresiones: 20_000, clics: 700, video3s: 9000, vioLanding: 630, compras: 10 }), "venta", 10);
  assert.deepEqual([bueno.cpm, bueno.ctr, bueno.hook, bueno.efectividad, bueno.cpa], ["bueno", "bueno", "bueno", "bueno", "bueno"]);
  const malo = nivelesDeMetricas(r({ gasto: 200, impresiones: 20_000, clics: 300, video3s: 4000, vioLanding: 180, compras: 5 }), "venta", 10);
  assert.deepEqual([malo.cpm, malo.ctr, malo.hook, malo.efectividad, malo.cpa, malo.cvr], ["malo", "malo", "malo", "malo", "malo", "bueno"]);
  // Hook de 28 % (entre 25 y 40): regular; CPA de $10 (entre 9.50 y 11): regular.
  const medio = nivelesDeMetricas(r({ gasto: 100, impresiones: 20_000, clics: 500, video3s: 5600, compras: 10 }), "venta", 10);
  assert.deepEqual([medio.hook, medio.cpa, medio.ctr], ["medio", "medio", "medio"]);
  assert.equal(nivelesDeMetricas(r({ gasto: 12, compras: 0 }), "venta", 10).cpa, "malo");
  assert.equal(nivelesDeMetricas(r({ gasto: 5, compras: 0 }), "venta", 10).cpa, "neutral");
  assert.equal(nivelesDeMetricas(r({ gasto: 80, compras: 8 }), "venta", 10).gasto, "neutral");
});

test("rotar gancho exige la frecuencia arriba de 2.80 cuando se conoce; sin dato, no la comprueba", () => {
  const base = clics(3, { gasto: 60, compras: 8, valor: 300 });
  const ult = r({ impresiones: 500, clics: 7, gasto: 20, compras: 1 });
  assert.equal(decisionDeAnuncio(entrada(base, { ultimos2: ult, frecuencia: 3.2 }))?.decision, "rotar");
  assert.match(decisionDeAnuncio(entrada(base, { ultimos2: ult, frecuencia: 3.2 }))?.motivo ?? "", /frecuencia ya es 3\.20/);
  assert.notEqual(decisionDeAnuncio(entrada(base, { ultimos2: ult, frecuencia: 1.8 }))?.decision, "rotar");
  assert.equal(decisionDeAnuncio(entrada(base, { ultimos2: ult, frecuencia: null }))?.decision, "rotar");
});

test("el tiempo promedio de reproducción se suma por total visto y se colorea con las zonas del documento", async () => {
  const { nivelFrecuencia, nivelTiempo, sumar, tiempoPromedio } = await import("./metricas");
  // Dos días: 100 reproducciones a 6 s y 300 a 10 s → 8.5 s en promedio (no el promedio simple de 8).
  const dos = sumar(r({ reproducciones: 100, segundosVistos: 600 }), r({ reproducciones: 300, segundosVistos: 3000 }));
  assert.equal(tiempoPromedio(dos), 9);
  assert.equal(tiempoPromedio(sinResultados()), null);
  assert.deepEqual([nivelTiempo(9), nivelTiempo(6), nivelTiempo(5), nivelTiempo(null)], ["bueno", "medio", "malo", "neutral"]);
  assert.deepEqual([nivelFrecuencia(1.8), nivelFrecuencia(2.5), nivelFrecuencia(3), nivelFrecuencia(null)], ["bueno", "medio", "malo", "neutral"]);
});

test("Meta da el tiempo promedio por reproducción: se guarda el total (promedio × reproducciones)", async () => {
  const { resultadoDiaDe } = await import("./normalizar");
  const d = resultadoDiaDe({ ad_id: "1", date_start: "2026-11-20", spend: "5", impressions: "1000", video_play_actions: [{ action_type: "video_view", value: "400" }], video_avg_time_watched_actions: [{ action_type: "video_view", value: "7.5" }] });
  assert.equal(d?.reproducciones, 400);
  assert.equal(d?.segundosVistos, 3000);
});
