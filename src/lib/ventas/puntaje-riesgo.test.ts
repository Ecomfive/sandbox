import assert from "node:assert/strict";
import { test } from "node:test";
import { falloPorZona, puntajeRiesgo, type SenalesRiesgo } from "./operacion";

const base: SenalesRiesgo = { riesgo: "ninguno", historial: { entregadas: 2, devueltas: 0, canceladas: 0, fallidas: 0 }, telefonoValido: true, noContactable: false, duplicada: false, cod: 30, hora: 14, falloZona: 0.1 };

test("un cliente normal queda bajo y sin motivos", () => assert.deepEqual(puntajeRiesgo(base), { valor: 0, nivel: "bajo", motivos: [] }));
test("las señales suman y dicen su motivo", () => {
  const p = puntajeRiesgo({ ...base, riesgo: "medio", telefonoValido: false, historial: { entregadas: 0, devueltas: 1, canceladas: 0, fallidas: 0 }, cod: 120, falloZona: 0.5 });
  assert.equal(p.valor, 70);
  assert.equal(p.nivel, "alto");
  assert.equal(p.motivos.length, 4);
});
test("las listas mandan", () => {
  assert.equal(puntajeRiesgo({ ...base, riesgo: "lista_blanca", telefonoValido: false }).valor, 0);
  assert.equal(puntajeRiesgo({ ...base, riesgo: "lista_negra" }).valor, 100);
});
test("fallo por zona solo con suficientes órdenes", () => {
  const z = falloPorZona([...Array(4)].map(() => ({ zona: "Bethania", fallo: true })).concat([{ zona: " bethania ", fallo: false }, { zona: "Pocas", fallo: true }]));
  assert.equal(z.get("bethania"), 0.8);
  assert.equal(z.has("pocas"), false);
});
