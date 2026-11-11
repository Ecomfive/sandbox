import assert from "node:assert/strict";
import test from "node:test";
import {
  curvaAcumulada,
  finDeMes,
  frecuencia,
  gastoPorMesDe,
  gastoPorPlataforma,
  indicadores,
  ltv,
  ltvCacBajo,
  mesesRecuperacion,
  plataformaDeTipo,
  poasBajo,
  recompra,
  referencia,
  sumarCohortes,
  type Cohorte,
  type PuntoCurva,
  type ResumenMes,
} from "./metricas";

// Cifras inventadas.

const cohorte = (mes: string, c: Partial<Cohorte>): Cohorte => ({
  ambito: "t1",
  cohorte: mes,
  clientes: 0,
  maduros_30: 0,
  maduros_60: 0,
  maduros_90: 0,
  maduros_180: 0,
  maduros_365: 0,
  recompra_30: 0,
  recompra_60: 0,
  recompra_90: 0,
  recompra_180: 0,
  ltv_90: 0,
  ltv_180: 0,
  ltv_365: 0,
  entregadas: 0,
  margen: 0,
  dias_segunda: 0,
  con_segunda: 0,
  ...c,
});

const resumen = (periodo: string, r: Partial<ResumenMes>): ResumenMes => ({
  ambito: "t1",
  periodo,
  ordenes: 0,
  entregadas: 0,
  ordenes_sin_cliente: 0,
  compradores: 0,
  nuevos: 0,
  recurrentes: 0,
  ventas: 0,
  costo_mercancia: 0,
  costo_envio: 0,
  margen: 0,
  ...r,
});

test("la plataforma sale del nombre del tipo de marketing (misma regla que la vista)", () => {
  assert.equal(plataformaDeTipo("Publicidad Online - FACEBOOK"), "meta");
  assert.equal(plataformaDeTipo("Publicidad Online - TIKTOK"), "tiktok");
  assert.equal(plataformaDeTipo("Publicidad Online - GOOGLE ADS"), "google");
  assert.equal(plataformaDeTipo("Publicidad Online - OTROS"), "otros");
  assert.equal(plataformaDeTipo("Publicidad Offline"), "offline");
});

test("recompra y LTV solo sobre los clientes maduros", () => {
  const c = cohorte("2026-01-01", { clientes: 100, maduros_30: 100, recompra_30: 12, maduros_90: 80, recompra_90: 20, maduros_180: 0, ltv_90: 3200 });
  assert.equal(recompra(c, 30), 0.12);
  assert.equal(recompra(c, 90), 0.25);
  assert.equal(recompra(c, 180), null);
  assert.equal(ltv(c, 90), 40);
  assert.equal(ltv(c, 180), null);
  const s = sumarCohortes([c, cohorte("2026-02-01", { clientes: 50, maduros_30: 50, recompra_30: 3 })]);
  assert.equal(s.clientes, 150);
  assert.equal(recompra(s, 30), 0.1);
});

test("referencia: las del período si maduraron; si no, las últimas maduras, marcadas como estimado", () => {
  const cs = [
    cohorte("2026-01-01", { clientes: 10, maduros_180: 10, ltv_180: 500 }),
    cohorte("2026-02-01", { clientes: 10, maduros_180: 10, ltv_180: 700 }),
    cohorte("2026-03-01", { clientes: 10, maduros_180: 5, ltv_180: 300 }),
    cohorte("2026-06-01", { clientes: 10 }),
  ];
  const propia = referencia(cs, ["2026-03-01"], 180)!;
  assert.equal(propia.estimado, false);
  assert.equal(ltv(propia.cohorte, 180), 60);
  const estimada = referencia(cs, ["2026-06-01"], 180)!;
  assert.equal(estimada.estimado, true);
  assert.deepEqual(estimada.meses, ["2026-01-01", "2026-02-01", "2026-03-01"]);
  assert.equal(ltv(estimada.cohorte, 180), 1500 / 25);
  assert.equal(referencia(cs, ["2025-12-01"], 180), null);
});

test("curva acumulada por cliente y meses para recuperar el CAC", () => {
  assert.equal(finDeMes("2026-01-01", 0), "2026-01-31");
  assert.equal(finDeMes("2026-01-01", 1), "2026-02-28");
  assert.equal(finDeMes("2026-11-01", 2), "2027-01-31");
  const cs = [cohorte("2026-01-01", { clientes: 10 }), cohorte("2026-02-01", { clientes: 10 })];
  const p = (c: string, mes: number, margen: number): PuntoCurva => ({ ambito: "t1", cohorte: c, mes, activos: 0, margen, completo: true });
  const puntos = [p("2026-01-01", 0, 100), p("2026-01-01", 2, 50), p("2026-02-01", 0, 120), p("2026-02-01", 1, 30)];
  // Corte a fin de marzo: enero tiene 3 meses completos, febrero 2.
  const curva = curvaAcumulada(puntos, cs, "2026-03-31");
  assert.deepEqual(curva, [(100 + 120) / 20, (100 + 150) / 20, 150 / 10]);
  assert.equal(mesesRecuperacion(curva, 10), 1);
  assert.equal(mesesRecuperacion(curva, 12), 2);
  assert.equal(mesesRecuperacion(curva, 15), 3);
  assert.equal(mesesRecuperacion(curva, 20), null);
  assert.equal(mesesRecuperacion(curva, null), null);
  // Un mes en curso no cuenta.
  assert.deepEqual(curvaAcumulada(puntos, cs, "2026-01-15"), []);
});

test("CAC, ROAS y POAS solo con los meses que el libro ya tiene", () => {
  const cs = [cohorte("2026-01-01", { clientes: 100, maduros_90: 100, recompra_90: 20, maduros_180: 100, ltv_180: 6000 })];
  const res = [
    resumen("2026-01-01", { nuevos: 100, recurrentes: 0, ventas: 5000, margen: 3000, ordenes: 150, entregadas: 110 }),
    resumen("2026-02-01", { nuevos: 50, recurrentes: 30, ventas: 4000, margen: 2500, ordenes: 100, entregadas: 90 }),
  ];
  const gasto = new Map([["2026-01-01", 2000], ["2026-02-01", 10]]);
  const i = indicadores(res, gasto, cs, [25, 40, 55], ["2026-01-01", "2026-02-01"], new Set(["2026-01-01"]));
  assert.equal(i.nuevos, 150);
  assert.equal(i.recurrentes, 30);
  assert.equal(i.gasto, 2000);
  assert.equal(i.cac, 20);
  assert.equal(i.roas, 2.5);
  assert.equal(i.poas, 1.5);
  assert.equal(i.recompra90, 0.2);
  assert.equal(i.ltv180, 60);
  assert.equal(i.ltvCac, 3);
  assert.equal(i.recuperacion, 1);
  assert.deepEqual(i.mesesSinLibro, ["2026-02-01"]);
  const sinLibro = indicadores(res, gasto, cs, [], ["2026-02-01"], new Set());
  assert.equal(sinLibro.cac, null);
  assert.equal(sinLibro.roas, null);
  assert.equal(sinLibro.ltvCac, null);
  assert.equal(ltvCacBajo(2.99), true);
  assert.equal(ltvCacBajo(3), false);
  assert.equal(ltvCacBajo(null), false);
  assert.equal(poasBajo(0.9), true);
  assert.equal(poasBajo(1), false);
});

test("frecuencia: distribución de entregas y días entre compras", () => {
  const f = frecuencia([
    { ambito: "t1", entregas: 1, clientes: 70, dias: 0, intervalos: 0 },
    { ambito: "t1", entregas: 2, clientes: 20, dias: 600, intervalos: 20 },
    { ambito: "t1", entregas: 5, clientes: 10, dias: 900, intervalos: 40 },
  ]);
  assert.deepEqual(f.porEntregas, [70, 20, 0, 0, 10]);
  assert.equal(f.clientes, 100);
  assert.equal(f.conRecompra, 0.3);
  assert.equal(f.diasEntreCompras, 25);
});

test("gasto por plataforma y por mes", () => {
  const filas = [
    { periodo: "2026-01-01", unidad_id: "t1", plataforma: "meta" as const, gasto: 100.1 },
    { periodo: "2026-01-01", unidad_id: "t2", plataforma: "meta" as const, gasto: 50.2 },
    { periodo: "2026-02-01", unidad_id: "t1", plataforma: "tiktok" as const, gasto: 30 },
  ];
  assert.deepEqual(gastoPorPlataforma(filas), { meta: 150.3, tiktok: 30, google: 0, otros: 0, offline: 0 });
  assert.deepEqual([...gastoPorMesDe(filas, "t1")], [["2026-01-01", 100.1], ["2026-02-01", 30]]);
  assert.deepEqual([...gastoPorMesDe(filas, "todas")], [["2026-01-01", 150.3], ["2026-02-01", 30]]);
});
