import { test } from "node:test";
import assert from "node:assert/strict";
import { colorValido, limpiarEtiqueta, MAX_ETIQUETAS, normalizarEtiquetas } from "./etiquetas";

test("limpia el nombre de una etiqueta", () => {
  assert.equal(limpiarEtiqueta("  Cliente   VIP "), "Cliente VIP");
  assert.equal(limpiarEtiqueta("a,b"), "a b");
  assert.equal(limpiarEtiqueta("   "), null);
  assert.equal(limpiarEtiqueta(3), null);
  assert.equal(limpiarEtiqueta("x".repeat(60))?.length, 40);
});

test("quita repetidos sin mirar mayúsculas ni acentos", () => {
  assert.deepEqual(normalizarEtiquetas(["Garantía", "garantia", "VIP", "", null]), ["Garantía", "VIP"]);
  assert.deepEqual(normalizarEtiquetas("no es lista"), []);
  assert.equal(normalizarEtiquetas(Array.from({ length: 30 }, (_, i) => `e${i}`)).length, MAX_ETIQUETAS);
});

test("valida el color", () => {
  assert.ok(colorValido("#7B68EE"));
  assert.ok(!colorValido("rojo"));
  assert.ok(!colorValido("#fff"));
});
