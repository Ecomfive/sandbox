import assert from "node:assert/strict";
import test from "node:test";
import { desviosPresupuesto, gastosAnomalos, mesesAntes } from "./desvios";

test("un gasto que se pasa más del 10 % avisa y más del 25 % es crítico", () => {
  const d = desviosPresupuesto("2026-10-01", { marketing: 1150, administracion: 2600, finanzas: 105 }, { marketing: 1000, administracion: 2000, finanzas: 90 });
  assert.equal(d.length, 2);
  const mkt = d.find((x) => x.seccion === "marketing")!;
  assert.equal(mkt.severidad, "aviso");
  assert.equal(mkt.desvio, 15);
  assert.equal(mkt.clave, "presupuesto:2026-10:marketing");
  assert.equal(d.find((x) => x.seccion === "administracion")!.severidad, "critica");
  // Finanzas: 16,7 % pero solo US$15 de diferencia: no avisa.
  assert.ok(!d.some((x) => x.seccion === "finanzas"));
});

test("ingresos: malo es quedar por debajo; pasarse no avisa", () => {
  assert.equal(desviosPresupuesto("2026-10-01", { ingresos: 8000 }, { ingresos: 10000 })[0].desvio, 20);
  assert.equal(desviosPresupuesto("2026-10-01", { ingresos: 12000 }, { ingresos: 10000 }).length, 0);
  assert.equal(desviosPresupuesto("2026-10-01", { marketing: 900 }, { marketing: 1000 }).length, 0);
});

test("sin presupuesto en la sección no se evalúa", () => {
  assert.equal(desviosPresupuesto("2026-10-01", { marketing: 5000 }, {}).length, 0);
});

test("un gasto que sube 50 % o más sobre su promedio es fuera de lo normal", () => {
  const meses = { "2026-04-01": 400, "2026-05-01": 420, "2026-06-01": 380, "2026-07-01": 410, "2026-08-01": 390, "2026-09-01": 400, "2026-10-01": 900 };
  const r = gastosAnomalos("2026-10-01", new Map([["t1", { nombre: "Software", seccion: "administracion" as const, meses }]]));
  assert.equal(r.length, 1);
  assert.equal(r[0].promedio, 400);
  assert.equal(r[0].sube, 125);
  assert.equal(r[0].clave, "anomalia:2026-10:t1");
});

test("sin historia suficiente, con poca diferencia o en costo de ventas no avisa", () => {
  const corta = new Map([["t", { nombre: "X", seccion: "administracion" as const, meses: { "2026-09-01": 100, "2026-10-01": 900 } }]]);
  assert.equal(gastosAnomalos("2026-10-01", corta).length, 0);
  const poca = new Map([["t", { nombre: "X", seccion: "administracion" as const, meses: { "2026-07-01": 100, "2026-08-01": 100, "2026-09-01": 100, "2026-10-01": 250 } }]]);
  assert.equal(gastosAnomalos("2026-10-01", poca).length, 0);
  const costo = new Map([["t", { nombre: "X", seccion: "costo_ventas" as const, meses: { "2026-07-01": 1000, "2026-08-01": 1000, "2026-09-01": 1000, "2026-10-01": 5000 } }]]);
  assert.equal(gastosAnomalos("2026-10-01", costo).length, 0);
});

test("los meses sin gasto no bajan el promedio (gasto trimestral)", () => {
  const meses = { "2026-04-01": 600, "2026-07-01": 600, "2026-09-01": 600, "2026-10-01": 650 };
  assert.equal(gastosAnomalos("2026-10-01", new Map([["t", { nombre: "Seguro", seccion: "otros" as const, meses }]])).length, 0);
});

test("meses anteriores cruzan el año", () => {
  assert.deepEqual(mesesAntes("2026-02-01", 3), ["2026-01-01", "2025-12-01", "2025-11-01"]);
});
