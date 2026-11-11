import test from "node:test";
import assert from "node:assert/strict";
import { paisDeOperacion, nombreDePais } from "./pais-finanzas";

test("sigue el país de la barra si tiene operación", () => {
  assert.equal(paisDeOperacion("MX", null), "MX");
  assert.equal(paisDeOperacion("cr", null), "CR");
});
test("un país sin operación cae a Panamá", () => {
  assert.equal(paisDeOperacion("HN", null), "PA");
  assert.equal(paisDeOperacion(undefined, null), "PA");
});
test("respeta los países permitidos de la persona", () => {
  assert.equal(paisDeOperacion("MX", ["CR"]), "CR");
  assert.equal(paisDeOperacion("PA", ["MX"]), "MX");
  assert.equal(paisDeOperacion("PA", ["HN"]), null);
});
test("nombres", () => {
  assert.equal(nombreDePais("MX"), "México");
  assert.equal(nombreDePais("XX"), "XX");
});
