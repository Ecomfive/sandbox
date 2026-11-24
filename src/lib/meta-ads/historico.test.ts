import assert from "node:assert/strict";
import test from "node:test";
import {
  analizarHistorico,
  filasMensuales,
  bandasDeMetricas,
  filasDeEntrega,
  funciono,
  hallazgosDeCaracteristicas,
  motivoDeCambio,
  rankingsDeVentas,
  sinVentanas,
  tasaDeEntrega,
  tasaPromedio,
  valorarCambio,
  type CampanaHist,
  type ProductoHist,
  type VideoHist,
} from "./historico";
import { sinResultados, type Resultados } from "./metricas";

const res = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });
/** Una campaña con 20.000 impresiones: `ctr` en % y `compras` dan el resto (gasto fijo en $150). */
const campana = (i: number, ctrPct: number, compras: number, o: Partial<CampanaHist> = {}): CampanaHist => ({
  id: `c${i}`,
  nombre: `Campaña ${i}`,
  producto: "SHILAJIT",
  clave: "SHILAJIT",
  familia: "suplemento",
  activa: true,
  etapa: "venta",
  estructura: "CBO",
  puja: null,
  angulo: null,
  tope: 10,
  total: res({ gasto: 150, impresiones: 20_000, clics: Math.round((20_000 * ctrPct) / 100), compras }),
  v: sinVentanas(),
  ...o,
});
const video = (i: number, angulo: string, compras: number, familia: VideoHist["familia"] = "suplemento", gasto = 120): VideoHist => ({
  id: `v${i}`,
  nombre: `Video ${i}`,
  producto: "SHILAJIT",
  clave: "SHILAJIT",
  familia,
  angulo,
  ganchoTipo: null,
  formato: null,
  ctaTipo: null,
  tope: 10,
  total: res({ gasto, compras }),
});

test("funcionó: gasto suficiente, alguna compra y el CPA dentro del tope", () => {
  assert.equal(funciono(res({ gasto: 150, compras: 20 }), 10), true);
  assert.equal(funciono(res({ gasto: 150, compras: 10 }), 10), false, "CPA de $15");
  assert.equal(funciono(res({ gasto: 50, compras: 10 }), 10), false, "poco gasto para compararse");
  assert.equal(funciono(res({ gasto: 150, compras: 0 }), 10), false);
});

test("las bandas dicen que con CTR bajo ninguna campaña funcionó, y el hallazgo lo avisa", () => {
  // 10 campañas con CTR de 1 % que no vendieron lo suficiente; 12 con CTR de 3,5 % de las que 9 funcionaron.
  const malas = Array.from({ length: 10 }, (_, i) => campana(i, 1, 5));
  const buenas = Array.from({ length: 12 }, (_, i) => campana(100 + i, 3.5, i < 9 ? 20 : 5));
  const b = bandasDeMetricas([...malas, ...buenas]).find((x) => x.id === "ctr")!;
  assert.equal(b.medibles, 22);
  assert.equal(b.filas[0].campanas, 10);
  assert.equal(b.filas[0].funcionaron, 0);
  assert.equal(b.filas[2].funcionaron, 9);
  const a = analizarHistorico({ campanas: [...malas, ...buenas], videos: [], productos: [], desde: "2025-11-01", hasta: "2026-11-24" });
  const no = a.hallazgos.find((h) => h.id.startsWith("banda:ctr:menos de 2 %") && h.categoria === "no_funciona");
  assert.ok(no, "debería avisar que con CTR menor a 2 % nunca funcionó");
  assert.match(no!.titulo, /ninguna campaña llegó a su CPA tope/);
  const si = a.hallazgos.find((h) => h.id.startsWith("banda:ctr:3 % o más") && h.categoria === "funciona");
  assert.ok(si);
  assert.match(si!.detalle, /9 de 12/);
});

test("con pocas campañas en una banda no se saca ninguna conclusión", () => {
  const pocas = [...Array.from({ length: 4 }, (_, i) => campana(i, 1, 5)), ...Array.from({ length: 12 }, (_, i) => campana(50 + i, 3.5, 20))];
  const a = analizarHistorico({ campanas: pocas, videos: [], productos: [], desde: null, hasta: null });
  assert.equal(a.hallazgos.filter((h) => h.id.startsWith("banda:ctr:menos de 2 %")).length, 0);
});

test("un ángulo que funciona mucho más en suplementos que en lo demás se señala, con su tipo de producto", () => {
  // «Antes y después»: 8 de 10 funcionan en suplementos; el resto de ángulos en suplementos: 2 de 10.
  const videos: VideoHist[] = [
    ...Array.from({ length: 10 }, (_, i) => video(i, "Antes y después", i < 8 ? 20 : 3)),
    ...Array.from({ length: 10 }, (_, i) => video(20 + i, "Testimonio", i < 2 ? 20 : 3)),
  ];
  const h = hallazgosDeCaracteristicas([], videos);
  const buen = h.find((x) => x.id === "angulo:Antes y después:si");
  assert.ok(buen);
  assert.match(buen!.detalle, /8 de 10 videos/);
  assert.ok(h.some((x) => x.id === "angulo@suplemento:Antes y después:si" && /suplementos/.test(x.titulo)));
  // Testimonio no sale como bueno.
  assert.ok(!h.some((x) => x.id === "angulo:Testimonio:si"));
});

test("un ángulo del que ninguno funcionó, con un resto que sí funciona, se avisa", () => {
  const videos: VideoHist[] = [...Array.from({ length: 9 }, (_, i) => video(i, "Humor", 2)), ...Array.from({ length: 12 }, (_, i) => video(30 + i, "Dolor", i < 6 ? 20 : 3))];
  const h = hallazgosDeCaracteristicas([], videos);
  assert.ok(h.some((x) => x.id === "angulo:Humor:no" && x.categoria === "no_funciona"));
});

test("la tasa de entrega pide pedidos resueltos suficientes y el promedio es ponderado", () => {
  assert.equal(tasaDeEntrega({ entregadas: 6, devueltas: 4 }), null, "solo 10 resueltos");
  assert.equal(tasaDeEntrega({ entregadas: 30, devueltas: 10 }), 0.75);
  assert.equal(tasaDeEntrega(null), null);
  const p = (e: ProductoHist["entrega"]): ProductoHist => ({ clave: "x", nombre: "x", familia: "general", tope: 10, campanas: 1, total: res({ gasto: 500, compras: 100 }), v: sinVentanas(), entrega: e });
  assert.equal(tasaPromedio([p({ nombre: "a", entregadas: 30, devueltas: 10, canceladas: 0, enCamino: 0 }), p({ nombre: "b", entregadas: 10, devueltas: 30, canceladas: 0, enCamino: 0 }), p(null)]), 0.5);
});

test("un producto con buen CPA y mala entrega se marca, y la compra entregada cuesta más", () => {
  const producto = (nombre: string, entregadas: number, devueltas: number): ProductoHist => ({
    clave: nombre,
    nombre,
    familia: "suplemento",
    tope: 10,
    campanas: 3,
    total: res({ gasto: 700, compras: 100 }),
    v: sinVentanas(),
    entrega: { nombre, entregadas, devueltas, canceladas: 5, enCamino: 2 },
  });
  const productos = [producto("Shilajit", 90, 10), producto("Corrector", 48, 52), producto("Rhodiola", 85, 15)];
  const filas = filasDeEntrega(productos);
  const malo = filas.find((f) => f.nombre === "Corrector")!;
  assert.equal(malo.veredicto, "vende_pero_no_entrega");
  assert.ok(Math.abs(malo.tasa! - 0.48) < 1e-9);
  // CPA $7; con 48 % de entrega, cada compra entregada cuesta ~ $14.58.
  assert.ok(Math.abs(malo.cpaEntregado! - 700 / 48) < 1e-9);
  assert.equal(filas.find((f) => f.nombre === "Shilajit")!.veredicto, "vende_y_entrega");
  const a = analizarHistorico({ campanas: [], videos: [], productos, desde: null, hasta: null });
  const h = a.hallazgos.find((x) => x.id === "entrega:Corrector:mala");
  assert.ok(h);
  assert.equal(h!.tono, "alerta");
  assert.match(h!.titulo, /vende bien pero solo se entrega 48 %/);
  // Lo alerta va antes que lo bueno.
  assert.equal(a.hallazgos[0].tono, "alerta");
});

test("sin tasa de entrega todavía, el producto no se juzga por eso", () => {
  const p: ProductoHist = { clave: "n", nombre: "Nuevo", familia: "general", tope: 10, campanas: 1, total: res({ gasto: 500, compras: 80 }), v: sinVentanas(), entrega: { nombre: "Nuevo", entregadas: 3, devueltas: 2, canceladas: 0, enCamino: 40 } };
  assert.equal(filasDeEntrega([p])[0].veredicto, "sin_entrega");
});

test("el motivo del cambio nombra lo que más empeoró en las métricas del anuncio", () => {
  const antes = res({ gasto: 500, impresiones: 100_000, clics: 3_000, vioLanding: 2_700, compras: 60 });
  // El CTR cae de 3 % a 1,8 % (−40 %), el resto igual.
  const ahora = res({ gasto: 500, impresiones: 100_000, clics: 1_800, vioLanding: 1_620, compras: 36 });
  assert.match(motivoDeCambio(antes, ahora, true) ?? "", /CTR −40 %/);
  // Nada se movió: no hay motivo en las métricas.
  assert.equal(motivoDeCambio(antes, antes, true), null);
});

test("valorar el cambio: baja, mejora, estable y poca data", () => {
  const v = (prev: Partial<Resultados>, rec: Partial<Resultados>) => ({ prev: res(prev), rec: res(rec) });
  const base = { impresiones: 100_000, clics: 3_000, vioLanding: 2_700 };
  // CPA de $5 a $8 (+60 %): baja.
  const baja = valorarCambio(v({ ...base, gasto: 500, compras: 100 }, { ...base, gasto: 400, compras: 50 }), 80);
  assert.equal(baja.sentido, "baja");
  assert.equal(baja.cpaPrev, 5);
  assert.equal(baja.cpaRec, 8);
  // CPA de $8 a $5: mejora.
  assert.equal(valorarCambio(v({ ...base, gasto: 400, compras: 50 }, { ...base, gasto: 500, compras: 100 }), 80).sentido, "mejora");
  // Casi igual: estable.
  assert.equal(valorarCambio(v({ ...base, gasto: 500, compras: 100 }, { ...base, gasto: 520, compras: 98 }), 80).sentido, "estable");
  // Poco gasto en uno de los dos: no se compara.
  assert.equal(valorarCambio(v({ ...base, gasto: 500, compras: 100 }, { ...base, gasto: 30, compras: 1 }), 80).sentido, "poca");
  // Gastó y dejó de vender: baja.
  assert.equal(valorarCambio(v({ ...base, gasto: 500, compras: 100 }, { ...base, gasto: 200, compras: 0 }), 80).sentido, "baja");
});

test("una campaña activa que empeoró aparece como tendencia a la baja con su motivo", () => {
  const prev = res({ gasto: 600, impresiones: 120_000, clics: 3_600, vioLanding: 3_240, compras: 120 });
  const rec = res({ gasto: 600, impresiones: 120_000, clics: 2_000, vioLanding: 1_800, compras: 55 });
  const c = campana(1, 3, 175, { total: res({ gasto: 1_200, compras: 175 }), v: { mes: { prev, rec }, semana: sinVentanas().semana } });
  const a = analizarHistorico({ campanas: [c], videos: [], productos: [], desde: null, hasta: null });
  const t = a.hallazgos.find((h) => h.categoria === "tendencia" && h.id.includes("Campaña") && h.id.endsWith(":mes"));
  assert.ok(t);
  assert.equal(t!.tono, "alerta");
  assert.match(t!.motivo ?? "", /CTR/);
});

test("el ranking de ventas suma, da la parte del total y usa la tasa de entrega del producto", () => {
  const cs = [campana(1, 3, 60, { id: "a", nombre: "A" }), campana(2, 3, 30, { id: "b", nombre: "B", clave: "OTRO", producto: "OTRO" }), campana(3, 3, 10, { id: "c", nombre: "C" })];
  const productos: ProductoHist[] = [
    { clave: "SHILAJIT", nombre: "Shilajit", familia: "suplemento", tope: 10, campanas: 2, total: res({ gasto: 300, compras: 70 }), v: sinVentanas(), entrega: { nombre: "Shilajit", entregadas: 80, devueltas: 20, canceladas: 0, enCamino: 0 } },
    { clave: "OTRO", nombre: "Otro", familia: "general", tope: 10, campanas: 1, total: res({ gasto: 150, compras: 30 }), v: sinVentanas(), entrega: null },
  ];
  const r = rankingsDeVentas(cs, [], productos);
  assert.deepEqual(r.campanas.map((x) => x.nombre), ["A", "B", "C"]);
  assert.equal(r.campanas[0].parte, 0.6);
  // A: 60 compras × 80 % = 48 entregadas, con la tasa de su producto.
  assert.equal(r.campanas[0].comprasEntregadas, 48);
  assert.equal(r.campanas[0].entregaReal, true);
  // B: su producto no tiene tasa: usa el promedio de todos (80 %) y lo dice.
  assert.equal(r.campanas[1].comprasEntregadas, 24);
  assert.equal(r.campanas[1].entregaReal, false);
});

test("sin nada que analizar no falla", () => {
  const a = analizarHistorico({ campanas: [], videos: [], productos: [], desde: null, hasta: null });
  assert.equal(a.hallazgos.length, 0);
  assert.equal(a.resumen.campanasMedibles, 0);
  assert.equal(a.rankings.campanas.length, 0);
});

test("el mes a mes sale ordenado, con las cifras calculadas", () => {
  const filas = filasMensuales([
    { mes: "2026-11", r: res({ gasto: 300, compras: 30, impresiones: 50_000, clics: 1_500 }) },
    { mes: "2026-10", r: res({ gasto: 400, compras: 80, impresiones: 80_000, clics: 2_000 }) },
  ]);
  assert.deepEqual(filas.map((f) => f.mes), ["2026-10", "2026-11"]);
  assert.equal(filas[0].cpa, 5);
  assert.equal(filas[1].cpa, 10);
  assert.equal(filas[1].ctr, 3);
  assert.equal(filas[0].hook, null, "sin vistas de 3 s no hay hook");
});

test("el análisis trae el mes a mes de todo y de los productos con más gasto", () => {
  const a = analizarHistorico({
    campanas: [],
    videos: [],
    productos: [],
    desde: null,
    hasta: null,
    mensual: [{ mes: "2026-10", r: res({ gasto: 100, compras: 10 }) }],
    mensualPorProducto: [
      { clave: "A", nombre: "A", meses: [{ mes: "2026-10", r: res({ gasto: 50, compras: 5 }) }] },
      { clave: "B", nombre: "B", meses: [{ mes: "2026-10", r: res({ gasto: 500, compras: 50 }) }] },
    ],
  });
  assert.equal(a.meses.length, 1);
  assert.deepEqual(a.mesesPorProducto.map((p) => p.nombre), ["B", "A"]);
});
