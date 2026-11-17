import assert from "node:assert/strict";
import test from "node:test";
import { coincidencias, errorDeRegla, esCompuesta, normalizarTexto, zonaPorReglas, type ReglaZona } from "./zonas";

const regla = (texto: string, resultado: "ciudad" | "interior" | "adelantado", id = texto): ReglaZona => ({ id, texto, clave: normalizarTexto(texto), resultado });
const reglas = [regla("Colón", "interior"), regla("Panamá Este", "interior"), regla("Panamá Oeste", "interior"), regla("Ciudad de Panamá", "ciudad")];

test("el texto se compara sin acentos, mayúsculas ni signos", () => {
  assert.equal(normalizarTexto("  PANAMÁ,  Este. "), "panama este");
  assert.equal(normalizarTexto("Colón"), "colon");
  assert.ok(esCompuesta("panama este"));
  assert.ok(!esCompuesta("colon"));
});

test("una regla sale en la dirección solo si están sus palabras completas y juntas", () => {
  assert.deepEqual(coincidencias("Calle 5, Colón, frente al banco", reglas).map((r) => r.texto), ["Colón"]);
  assert.deepEqual(coincidencias("URB. LAS CUMBRES, PANAMA ESTE", reglas).map((r) => r.texto), ["Panamá Este"]);
  // «Colonia» no es «Colón», y «Panamá» a secas no es «Panamá Este».
  assert.deepEqual(coincidencias("Colonia Los Pinos, Panamá", reglas), []);
  assert.deepEqual(coincidencias("Este de Panamá", reglas), []);
});

test("la regla de más palabras gana; si empatan y se contradicen, hay conflicto", () => {
  const r = [regla("Panamá", "ciudad"), regla("Panamá Este", "interior")];
  assert.equal(zonaPorReglas(coincidencias("Chepo, Panamá Este", r)).zona, "interior");
  assert.equal(zonaPorReglas(coincidencias("Casa 3, Panamá", r)).zona, "ciudad");
  const mal = [regla("Los Andes", "ciudad"), regla("Santa Clara", "interior")];
  const c = zonaPorReglas(coincidencias("Los Andes, Santa Clara", mal));
  assert.equal(c.zona, null);
  assert.ok(c.conflicto);
  assert.deepEqual(zonaPorReglas([]), { zona: null, conflicto: false, reglas: [] });
});

test("qué se acepta como regla", () => {
  assert.equal(errorDeRegla("Colón"), null);
  assert.ok(errorDeRegla("a"));
  assert.ok(errorDeRegla("!!"));
  assert.ok(errorDeRegla("x".repeat(81)));
});

test("una palabra de pago por adelantado gana sobre las demás, aunque la dirección diga interior", () => {
  const todas = [...reglas, regla("Puerto Armuelles", "adelantado")];
  const r = zonaPorReglas(coincidencias("Barrio Balboa, Puerto Armuelles, Colón", todas));
  assert.equal(r.zona, "adelantado");
  assert.equal(r.conflicto, false);
});
