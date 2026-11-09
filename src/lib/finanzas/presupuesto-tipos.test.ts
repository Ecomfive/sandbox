import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, type FilaEerr } from "./eerr";
import {
  celdasCambiadas,
  compararPorTipo,
  detalleDeLineas,
  editarSeccion,
  elegirPresupuesto,
  generarLineas,
  mesesDelAnio,
  pesosPorTipo,
  repartirEntreTipos,
  repartirProporcional,
  serieDeDetalle,
  serieDeEerr,
  serieDeLineas,
  sumaEn,
  sumarSeries,
  supuestosPorDefecto,
  tieneTipos,
  valorEnSeccion,
  type RealTipo,
} from "./presupuesto";

// Datos inventados: dos tiendas, tres meses base, tipos «t-…».
const BASE = ["2026-01-01", "2026-02-01", "2026-03-01"];
const r = (unidad_id: string, tipo_id: string, seccion: RealTipo["seccion"], periodo: string, valor: number): RealTipo => ({ unidad_id, tipo_id, seccion, periodo, valor });
const REALES: RealTipo[] = BASE.flatMap((m) => [
  r("a", "t-ventas", "ingresos", m, 1050),
  r("a", "t-devol", "ingresos", m, -50),
  r("b", "t-ventas", "ingresos", m, 500),
  r("a", "t-meta", "marketing", m, 140),
  r("a", "t-tiktok", "marketing", m, 59),
  r("a", "t-otro", "marketing", m, 1),
  r("b", "t-meta", "marketing", m, 100),
  r("a", "t-merca", "costo_ventas", m, 600),
  r("b", "t-merca", "costo_ventas", m, 300),
]);

test("valor en la sección: devoluciones restan en ingresos, un reverso resta en gastos", () => {
  assert.equal(valorEnSeccion("ingresos", 1, 100), 100);
  assert.equal(valorEnSeccion("ingresos", -1, 30), -30);
  assert.equal(valorEnSeccion("marketing", -1, 40), 40);
  assert.equal(valorEnSeccion("marketing", 1, 40), -40);
});

test("pesos por tipo del consolidado y de una tienda", () => {
  const p = pesosPorTipo(REALES, BASE);
  assert.equal(p.get("marketing")!.get("t-meta"), 720);
  assert.equal(p.get("ingresos")!.get("t-devol"), -150);
  assert.equal(pesosPorTipo(REALES, BASE, "b").get("marketing")!.size, 1);
  assert.equal(pesosPorTipo(REALES, ["2025-12-01"]).size, 0);
});

test("repartir entre tipos: los de 1 % o más llevan su parte, el resto a «Otros», y suma exacto", () => {
  // Marketing consolidado: meta 240, tiktok 59, otro 1 (0,33 %) por mes.
  const pesos = new Map([["t-meta", 240], ["t-tiktok", 59], ["t-otro", 1]]);
  const out = repartirEntreTipos(1000, pesos);
  assert.equal(out.get("t-meta"), 800);
  assert.equal(out.get("t-tiktok"), 196.67);
  assert.equal(out.get(null), 3.33);
  assert.equal(out.has("t-otro"), false);
  assert.equal(Math.round([...out.values()].reduce((a, b) => a + b, 0) * 100) / 100, 1000);
  // Pesos negativos (devoluciones) también cuentan.
  const ing = repartirEntreTipos(2000, new Map([["v", 1550], ["d", -50]]));
  assert.equal(ing.get("v"), 2066.67);
  assert.equal(ing.get("d"), -66.67);
  assert.equal(ing.has(null), false);
  // Sin pesos o en cero: todo a «Otros».
  assert.deepEqual([...repartirEntreTipos(10, undefined)], [[null, 10]]);
  assert.deepEqual([...repartirEntreTipos(10, new Map([["x", 5], ["y", -5]]))], [[null, 10]]);
});

test("generar con tipos: la sección suma lo mismo que sin tipos, consolidado y por tienda", () => {
  const meses = mesesDelAnio(2026);
  const porUnidad = new Map(
    ["a", "b"].map((u) => {
      const filas: FilaEerr[] = REALES.filter((x) => x.unidad_id === u).map((x) => ({
        periodo: x.periodo,
        unidad_id: u,
        tipo: x.tipo_id,
        orden: 1,
        seccion: x.seccion,
        signo: x.seccion === "ingresos" && x.valor > 0 ? 1 : -1,
        monto: Math.abs(x.valor),
      }));
      return [u, serieDeEerr(armarEerr(filas, meses))];
    }),
  );
  const sup = supuestosPorDefecto(sumarSeries([...porUnidad.values()], BASE), BASE);
  const sin = generarLineas(sup, porUnidad, 2026, false);
  const con = generarLineas(sup, porUnidad, 2026, false, REALES);
  const conTienda = generarLineas(sup, porUnidad, 2026, true, REALES);
  for (const esc of ["conservador", "base", "optimista"] as const) {
    const a = serieDeLineas(sin, esc, meses);
    const b = serieDeLineas(con, esc, meses);
    const c = serieDeLineas(conTienda, esc, meses);
    for (const s of ["ingresos", "costo_ventas", "marketing"] as const) {
      assert.equal(Math.round(sumaEn(a[s], meses)), Math.round(sumaEn(b[s], meses)));
      assert.equal(Math.round(sumaEn(a[s], meses)), Math.round(sumaEn(c[s], meses)));
    }
  }
  const det = detalleDeLineas(con, "base", meses);
  assert.deepEqual(det.marketing.map((f) => f.tipo_id), ["t-meta", "t-tiktok", null]);
  assert.ok(tieneTipos(det.marketing));
  // Una sección sin real por tipo (administración) queda entera en «Otros».
  assert.deepEqual(det.administracion.map((f) => f.tipo_id), [null]);
  assert.ok(!tieneTipos(det.administracion));
  // Por tienda: la tienda b solo tiene Meta.
  assert.deepEqual(detalleDeLineas(conTienda, "base", meses, "b").marketing.map((f) => f.tipo_id), ["t-meta"]);
  // Las líneas por tipo son únicas por celda.
  const llaves = new Set(conTienda.map((l) => `${l.escenario}|${l.periodo}|${l.unidad_id}|${l.seccion}|${l.tipo_id}`));
  assert.equal(llaves.size, conTienda.length);
});

test("un presupuesto viejo (sin tipos) se lee como una fila «Otros» por sección", () => {
  const meses = ["2026-01-01", "2026-02-01"];
  const viejo = [
    { escenario: "base", periodo: "2026-01-01", unidad_id: null, seccion: "marketing", monto: 100 },
    { escenario: "base", periodo: "2026-02-01", unidad_id: null, seccion: "marketing", monto: 120 },
  ];
  const det = detalleDeLineas(viejo, "base", meses);
  assert.deepEqual(det.marketing, [{ tipo_id: null, meses: { "2026-01-01": 100, "2026-02-01": 120 } }]);
  assert.equal(serieDeDetalle(det, meses).marketing["2026-02-01"], 120);
  assert.deepEqual(compararPorTipo(det, [], meses), {});
});

test("editar: un tipo recalcula la sección; la sección se reparte entre sus tipos", () => {
  const meses = ["2026-01-01", "2026-02-01"];
  const filas = [
    { tipo_id: "meta", meses: { "2026-01-01": 300, "2026-02-01": 300 } },
    { tipo_id: null, meses: { "2026-01-01": 100, "2026-02-01": 100 } },
  ];
  const tipo = editarSeccion(filas, meses, "meta", "2026-01-01", 500);
  assert.equal(tipo[0].meses["2026-01-01"], 500);
  assert.equal(filas[0].meses["2026-01-01"], 300, "no cambia lo que recibe");
  const sec = editarSeccion(filas, meses, undefined, "2026-02-01", 800);
  assert.deepEqual(sec.map((f) => f.meses["2026-02-01"]), [600, 200]);
  const anual = editarSeccion(filas, meses, undefined, null, 1600);
  assert.deepEqual(anual.map((f) => f.meses), [
    { "2026-01-01": 600, "2026-02-01": 600 },
    { "2026-01-01": 200, "2026-02-01": 200 },
  ]);
  const anualTipo = editarSeccion(filas, meses, null, null, 300);
  assert.deepEqual(anualTipo[1].meses, { "2026-01-01": 150, "2026-02-01": 150 });
  // Sin líneas: nace «Otros».
  assert.deepEqual(editarSeccion([], meses, undefined, "2026-01-01", 50), [{ tipo_id: null, meses: { "2026-01-01": 50, "2026-02-01": 0 } }]);
  // Un tipo nuevo para la sección.
  assert.equal(editarSeccion(filas, meses, "tiktok", "2026-01-01", 10).length, 3);
  // Solo cambian las celdas tocadas.
  assert.deepEqual(celdasCambiadas(filas, sec, meses), [
    { tipo_id: "meta", periodo: "2026-02-01", monto: 600 },
    { tipo_id: null, periodo: "2026-02-01", monto: 200 },
  ]);
});

test("repartir proporcional: suma exacta y, si todo es cero, a «Otros»", () => {
  const out = repartirProporcional(new Map([["a", 1], ["b", 2], [null, 0]]), 100);
  assert.deepEqual([...out], [["a", 33.33], ["b", 66.67], [null, 0]]);
  assert.deepEqual([...repartirProporcional(new Map([["a", 0]]), 9)], [["a", 0], [null, 9]]);
});

test("presupuesto vs real por tipo: lo que no tiene línea propia va a «Otros»", () => {
  const meses = ["2026-07-01"];
  const det = detalleDeLineas(
    [
      { escenario: "base", periodo: "2026-07-01", unidad_id: null, seccion: "marketing", tipo_id: "meta", monto: 300 },
      { escenario: "base", periodo: "2026-07-01", unidad_id: null, seccion: "marketing", tipo_id: null, monto: 20 },
    ],
    "base",
    meses,
  );
  const reales = [r("a", "meta", "marketing", "2026-07-01", 360), r("a", "nuevo", "marketing", "2026-07-01", 15), r("b", "otro", "marketing", "2026-07-01", 10)];
  const c = compararPorTipo(det, reales, meses).marketing!;
  assert.deepEqual(c.map((x) => [x.tipo_id, x.acumulado.real, x.acumulado.presupuesto, x.acumulado.favorable]), [
    ["meta", 360, 300, false],
    [null, 25, 20, false],
  ]);
  assert.equal(c[0].acumulado.pct, 20);
});

test("elegir presupuesto: el pedido, si no el aprobado más reciente, si no el último creado", () => {
  const lista = [
    { id: "c", estado: "borrador" as const, aprobado_en: null },
    { id: "b", estado: "aprobado" as const, aprobado_en: "2026-03-01" },
    { id: "a", estado: "aprobado" as const, aprobado_en: "2026-05-01" },
  ];
  assert.equal(elegirPresupuesto(lista, "c")?.id, "c");
  assert.equal(elegirPresupuesto(lista, "zzz")?.id, "a");
  assert.equal(elegirPresupuesto(lista)?.id, "a");
  assert.equal(elegirPresupuesto([lista[0]])?.id, "c");
  assert.equal(elegirPresupuesto([]), null);
});
