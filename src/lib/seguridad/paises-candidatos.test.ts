import assert from "node:assert/strict";
import { test } from "node:test";
import { paisesCandidatos } from "../paises-permitidos";

const NAV = [{ codigo: "CR" }, { codigo: "PA" }, { codigo: "MX", pronto: true }];

test("sin límite manda el elegido", () => {
  assert.deepEqual(paisesCandidatos("PA", null, NAV), ["PA"]);
});

test("con límite, el elegido si es suyo y luego los suyos", () => {
  assert.deepEqual(paisesCandidatos("PA", ["PA", "CR"], NAV), ["PA", "CR"]);
  assert.deepEqual(paisesCandidatos("CR", ["PA"], NAV), ["PA"]);
  assert.deepEqual(paisesCandidatos("CR", ["MX"], NAV), ["MX"]);
});

test("con límite nunca ofrece un país que no tiene", () => {
  assert.deepEqual(paisesCandidatos("CR", ["importacion"], NAV), []);
  assert.deepEqual(paisesCandidatos("CR", [], NAV), []);
});
