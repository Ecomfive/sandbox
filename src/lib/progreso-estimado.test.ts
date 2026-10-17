import assert from "node:assert/strict";
import test from "node:test";
import { fraccionEstimada, pasoActual, TOPE_ESTIMADO } from "./progreso-estimado";

test("la barra arranca rápido, frena y nunca llega al final sola", () => {
  assert.equal(fraccionEstimada(0, 8000), 0);
  assert.equal(fraccionEstimada(-5, 8000), 0);
  const cuarto = fraccionEstimada(2000, 8000);
  assert.ok(cuarto > 0.4, `a un cuarto del tiempo ya va por la mitad: ${cuarto}`);
  const mitad = fraccionEstimada(4000, 8000);
  const total = fraccionEstimada(8000, 8000);
  assert.ok(mitad > cuarto && total > mitad && total < TOPE_ESTIMADO);
  // Más lento cuanto más avanza.
  assert.ok(mitad - cuarto < cuarto - 0);
  // Si tarda mucho más de lo esperado, sigue sin llegar al 100 %.
  const largo = fraccionEstimada(120_000, 8000);
  assert.ok(largo <= TOPE_ESTIMADO && largo < 1);
  // Crece siempre (nunca parece trabada) mientras no toque el tope.
  assert.ok(fraccionEstimada(8100, 8000) > fraccionEstimada(8000, 8000));
});

test("una estimación inválida no rompe nada", () => {
  for (const e of [0, -1, NaN]) assert.equal(fraccionEstimada(1000, e), 0);
});

test("los pasos cambian seguido al principio y el último dura lo que falte", () => {
  assert.equal(pasoActual(0, 4), 0);
  assert.equal(pasoActual(TOPE_ESTIMADO, 4), 3);
  assert.equal(pasoActual(9, 4), 3);
  assert.equal(pasoActual(-1, 4), 0);
  assert.equal(pasoActual(0.5, 1), 0);
  // Con 4 pasos y 8 s esperados, el segundo paso llega antes de 1 s y el tercero antes de 2 s.
  assert.ok(pasoActual(fraccionEstimada(1000, 8000), 4) >= 1);
  assert.ok(pasoActual(fraccionEstimada(2000, 8000), 4) >= 2);
});
