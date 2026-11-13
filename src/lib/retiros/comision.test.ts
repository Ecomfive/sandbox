import assert from "node:assert/strict";
import test from "node:test";
import { comisionDesdeRecibido, desdePorcentaje, revisarConciliacion } from "./comision";

test("la comisión sale de lo recibido al conciliar", () => {
  assert.deepEqual(comisionDesdeRecibido(18000, 17868), { comision: 132, porcentaje: 0.73 });
  assert.deepEqual(comisionDesdeRecibido(1000, 1000), { comision: 0, porcentaje: 0 });
  assert.equal(comisionDesdeRecibido(0, 10), null);
  assert.equal(comisionDesdeRecibido(100, Number.NaN), null);
});

test("con el porcentaje escrito a mano", () => {
  assert.deepEqual(desdePorcentaje(18000, 0.73), { comision: 131.4, recibido: 17868.6 });
  assert.equal(desdePorcentaje(0, 1), null);
});

test("conciliar pide que monto − comisión = recibido", () => {
  assert.equal(revisarConciliacion(18000, 17868, 132), null);
  assert.equal(revisarConciliacion(18000, 17868, 132.004), null);
  assert.match(revisarConciliacion(18000, 17868, 100) ?? "", /No cuadra/);
  assert.match(revisarConciliacion(18000, 18100, -100) ?? "", /más que el monto/);
  assert.match(revisarConciliacion(18000, Number.NaN, 0) ?? "", /Falta/);
});
