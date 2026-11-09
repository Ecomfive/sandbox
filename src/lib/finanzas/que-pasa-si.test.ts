import assert from "node:assert/strict";
import { test } from "node:test";
import type { Linea } from "./proyeccion-caja";
import { aplicarQueSi, cobrosAtrasables, compararQueSi, correrDias, ESCENARIO_NEUTRO } from "./que-pasa-si";

const semanas = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"];
const lineas: Linea[] = [
  { concepto: "ventas", detalle: "Tienda A", valores: [1000, 1000, 1000, 1000] },
  { concepto: "cxc", detalle: "Por vencer", valores: [0, 700, 0, 0] },
  { concepto: "marketing", detalle: "Meta", valores: [200, 200, 200, 200] },
  { concepto: "nomina", detalle: "Planilla", valores: [0, 1500, 0, 1500] },
];

test("correr días reparte entre dos semanas y pierde lo que sale", () => {
  assert.deepEqual(correrDias([700, 0, 0], 7), [0, 700, 0]);
  assert.deepEqual(correrDias([700, 0, 0], 3.5), [350, 350, 0]);
  assert.deepEqual(correrDias([0, 0, 700], 7), [0, 0, 0]);
});

test("el escenario neutro no cambia nada", () => {
  assert.deepEqual(aplicarQueSi(lineas, ESCENARIO_NEUTRO), lineas);
});

test("ventas abajo, marketing arriba y un cobro atrasado", () => {
  const r = aplicarQueSi(lineas, { ventas: -0.1, marketing: 0.5, cobro: "cxc|Por vencer", dias: 14 });
  assert.deepEqual(r[0].valores, [900, 900, 900, 900]);
  assert.deepEqual(r[1].valores, [0, 0, 0, 700]);
  assert.deepEqual(r[2].valores, [300, 300, 300, 300]);
  assert.deepEqual(r[3].valores, lineas[3].valores);
});

test("comparación contra la base", () => {
  const c = compararQueSi(lineas, semanas, 500, 100, { ventas: -0.5, marketing: 0, cobro: null, dias: 0 });
  assert.equal(c.cajaFinal.base, 500 + 4000 + 700 - 800 - 3000);
  assert.equal(c.cajaFinal.escenario, 500 + 2000 + 700 - 800 - 3000);
  assert.ok(c.cajaMinima.escenario < c.cajaMinima.base);
  assert.deepEqual(cobrosAtrasables(lineas).map((x) => x.clave), ["ventas|Tienda A", "cxc|Por vencer"]);
});
