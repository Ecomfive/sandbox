import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, type FilaEerr } from "./eerr";
import { accionesDelMes, cifrasDelMes, desempenoVsPresupuesto, desviosPorTipo, excesosDePresupuesto } from "./informe";
import { vsPresupuestoAcumulado } from "./panel";

// Datos inventados: Panel e Informe contra el presupuesto.
const f = (periodo: string, seccion: FilaEerr["seccion"], tipo: string, signo: number, monto: number): FilaEerr => ({ periodo, unidad_id: "t", tipo, orden: 1, seccion, signo, monto });
const JUL = "2026-07-01";
const AGO = "2026-08-01";
const meses = ["2026-06-01", JUL, AGO, "2026-09-01"];
const eerr = armarEerr(
  [
    f(JUL, "ingresos", "Ventas", 1, 10000),
    f(JUL, "marketing", "Meta", -1, 3000),
    f(JUL, "marketing", "Influencers", -1, 200),
    f(AGO, "ingresos", "Ventas", 1, 12000),
    f(AGO, "marketing", "Meta", -1, 2000),
    f(AGO, "otros", "Retiro de dividendos", -1, 5000),
    f("2026-09-01", "ingresos", "Ventas", 1, 500),
  ],
  meses,
);
const NOMBRES = { "id-ventas": "Ventas", "id-meta": "Meta" };
const l = (periodo: string, seccion: string, tipo_id: string | null, monto: number, escenario = "base") => ({ escenario, periodo, unidad_id: null, seccion, tipo_id, monto });
const LINEAS = [
  l(JUL, "ingresos", "id-ventas", 11000),
  l(JUL, "marketing", "id-meta", 2000),
  l(JUL, "marketing", null, 100),
  l(AGO, "ingresos", "id-ventas", 11000),
  l(AGO, "marketing", "id-meta", 2200),
  l(AGO, "marketing", null, 100),
  l(JUL, "ingresos", "id-ventas", 99999, "optimista"),
];

test("panel: ingresos y EBITDA del año a la fecha contra el presupuesto base (sin el mes en curso)", () => {
  const conDatos = new Set([JUL, AGO, "2026-09-01"]);
  const v = vsPresupuestoAcumulado(eerr, conDatos, "2026-09-01", LINEAS)!;
  assert.deepEqual(v.meses, [JUL, AGO]);
  assert.equal(v.ingresos.real, 22000);
  assert.equal(v.ingresos.presupuesto, 22000);
  assert.equal(v.ingresos.favorable, null);
  assert.equal(v.ebitda.real, 22000 - 5200);
  assert.equal(v.ebitda.presupuesto, 22000 - 4400);
  assert.equal(v.ebitda.favorable, false);
  assert.equal(vsPresupuestoAcumulado(eerr, conDatos, "2026-07-01", LINEAS), null);
});

test("informe: desempeño del mes contra el presupuesto", () => {
  const d = desempenoVsPresupuesto(eerr, LINEAS, JUL);
  assert.deepEqual(d.map((x) => x.concepto), ["ingresos", "margen_bruto", "ebitda", "resultado"]);
  assert.equal(d[0].acumulado.pct, (-1000 / 11000) * 100);
  // El resultado no cuenta los dividendos.
  assert.equal(desempenoVsPresupuesto(eerr, LINEAS, AGO)[3].acumulado.real, 10000);
});

test("informe: desvío por tipo y acción si un gasto se pasa más de 10 % y $500", () => {
  const d = desviosPorTipo(eerr, LINEAS, NOMBRES, JUL);
  const meta = d.find((x) => x.tipo === "Meta")!;
  assert.equal(meta.diferencia, 1000);
  assert.equal(meta.pct, 50);
  assert.equal(meta.impacto, -1000);
  const otros = d.find((x) => x.tipo === "Otros de marketing")!;
  assert.deepEqual([otros.real, otros.presupuesto], [200, 100]);
  assert.equal(d[0].tipo, "Ventas", "el que más empeora primero");
  // Otros de marketing se pasó 100 % pero solo $100: no es acción.
  assert.deepEqual(excesosDePresupuesto(d).map((x) => x.tipo), ["Meta"]);
  const acciones = accionesDelMes(cifrasDelMes(eerr, JUL), cifrasDelMes(eerr, JUL), [], [], d);
  assert.ok(acciones.some((a) => a.clave === "ppto-marketing-Meta" && a.texto.includes("50 %")));
  // Los dividendos no aparecen.
  assert.ok(!desviosPorTipo(eerr, LINEAS, NOMBRES, AGO).some((x) => x.seccion === "otros"));
});

test("informe: un presupuesto sin tipos se compara por sección", () => {
  const viejo = [l(JUL, "marketing", null, 2500), l(JUL, "ingresos", null, 10000)];
  const d = desviosPorTipo(eerr, viejo, {}, JUL);
  assert.deepEqual(d.map((x) => [x.tipo, x.real, x.presupuesto]), [
    ["Marketing", 3200, 2500],
    ["Ingresos", 10000, 10000],
  ]);
});
