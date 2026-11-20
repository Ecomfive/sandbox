import assert from "node:assert/strict";
import test from "node:test";
import { filtrarProductos } from "./topes";

const filas = [{ producto: "ACEITE DE CALABAZA" }, { producto: "Aceite Colágeno" }, { producto: "15 DAY CLEANSE" }];

test("busca por palabras, sin acentos ni mayúsculas y en cualquier orden", () => {
  assert.deepEqual(filtrarProductos(filas, "colageno"), [filas[1]]);
  assert.deepEqual(filtrarProductos(filas, "calabaza aceite"), [filas[0]]);
  assert.equal(filtrarProductos(filas, "ACEITE").length, 2);
  assert.deepEqual(filtrarProductos(filas, "cle"), [filas[2]]);
});

test("sin texto salen todos y sin coincidencias, ninguno", () => {
  assert.equal(filtrarProductos(filas, "   ").length, 3);
  assert.equal(filtrarProductos(filas, "zzz").length, 0);
});
