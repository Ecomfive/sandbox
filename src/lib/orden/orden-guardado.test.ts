import { test } from "node:test";
import assert from "node:assert/strict";
import { esOrdenDefecto, leerOrden, moverAntes, moverUnPaso, soltarSobre } from "./orden-guardado";

const D = ["a", "b", "c", "d", "e"];

test("orden guardado: se lee con cuidado", () => {
  assert.deepEqual(leerOrden(null, D), D);
  assert.deepEqual(leerOrden("no es json", D), D);
  assert.deepEqual(leerOrden('["e","raro","e","b"]', D), ["e", "b", "a", "c", "d"], "sin desconocidos ni repetidos; los que faltan al final");
  assert.equal(esOrdenDefecto(D, D), true);
  assert.equal(esOrdenDefecto(["b", "a", "c", "d", "e"], D), false);
});

test("orden guardado: arrastrar y mover con el teclado", () => {
  assert.deepEqual(moverAntes(D, "e", "a"), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(moverAntes(D, "a", null), ["b", "c", "d", "e", "a"]);
  assert.deepEqual(soltarSobre(D, "a", "c"), ["b", "c", "a", "d", "e"], "de antes: queda después");
  assert.deepEqual(soltarSobre(D, "e", "b"), ["a", "e", "b", "c", "d"], "de después: queda antes");
  assert.deepEqual(soltarSobre(D, "c", "c"), D);
  const visibles = ["b", "c", "d", "e"];
  assert.deepEqual(moverUnPaso(D, "c", -1, visibles), ["a", "c", "b", "d", "e"]);
  assert.deepEqual(moverUnPaso(D, "c", 1, visibles), ["a", "b", "d", "c", "e"]);
  assert.deepEqual(moverUnPaso(D, "b", -1, visibles), D, "el primero que se ve no va más atrás aunque haya uno oculto antes");
  assert.deepEqual(moverUnPaso(D, "e", 1, visibles), D);
});
