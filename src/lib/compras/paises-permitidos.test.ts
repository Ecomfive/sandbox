import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarPaises, puedeVerPais, textoPaisesPermitidos } from "../paises-permitidos";

test("sin límite (null) ve todos los países y la Importadora", () => {
  assert.equal(puedeVerPais(null, "PA"), true);
  assert.equal(puedeVerPais(null, null), true);
});

test("con países limitados solo ve los suyos", () => {
  assert.equal(puedeVerPais(["CR"], "CR"), true);
  assert.equal(puedeVerPais(["CR"], "PA"), false);
  assert.equal(puedeVerPais([], "CR"), false);
});

test("la Importadora (sin país) solo con «importacion» en la lista", () => {
  assert.equal(puedeVerPais(["PA"], null), false);
  assert.equal(puedeVerPais(["PA", "importacion"], null), true);
});

test("filtrar la lista de países y leerla", () => {
  const paises = [{ codigo: "PA" }, { codigo: "CR" }, { codigo: "MX" }];
  assert.deepEqual(filtrarPaises(["CR"], paises), [{ codigo: "CR" }]);
  assert.equal(filtrarPaises(null, paises).length, 3);
  assert.equal(textoPaisesPermitidos(null, {}), "Todos los países");
  assert.equal(textoPaisesPermitidos(["PA", "importacion"], { PA: "Panamá" }), "Panamá, Importadora");
});
