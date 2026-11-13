import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaTalla } from "./talla";

test("las tallas con X repetida se dicen con número", () => {
  assert.equal(etiquetaTalla("XXL"), "2XL");
  assert.equal(etiquetaTalla("xxl"), "2XL");
  assert.equal(etiquetaTalla("XXXL"), "3XL");
  assert.equal(etiquetaTalla("XXXXL"), "4XL");
  assert.equal(etiquetaTalla("XXS"), "2XS");
});

test("funciona dentro de un texto más largo y no toca lo demás", () => {
  assert.equal(etiquetaTalla("Beige / XXL"), "Beige / 2XL");
  assert.equal(etiquetaTalla("Faja body enterizo beige XXL"), "Faja body enterizo beige 2XL");
  for (const igual of ["XL", "2XL", "L", "M", "S", "XS", "Beige", "TOXXL", "XXLARGE", "XX", "43"]) assert.equal(etiquetaTalla(igual), igual);
});

import { compararOpciones, compararTalla, esTallaConocida } from "./talla";

test("las tallas van de la más chica a la más grande", () => {
  const desordenadas = ["XL", "L", "XXL", "S", "M", "XXXL", "XS"];
  assert.deepEqual([...desordenadas].sort(compararTalla), ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);
  assert.deepEqual(["2XL", "XL", "L"].sort(compararTalla), ["L", "XL", "2XL"]);
});

test("los números van de menor a mayor, después de las tallas de letra, y lo demás por letra", () => {
  assert.deepEqual(["44", "9", "43", "M", "Única", "Azul"].sort(compararTalla), ["M", "9", "43", "44", "Azul", "Única"]);
  assert.equal(esTallaConocida("xxl"), true);
  assert.equal(esTallaConocida("Beige"), false);
});

test("las variantes con color y talla van por color y, dentro, por talla", () => {
  const lista = ["Negro / L", "Beige / XXL", "Beige / S", "Negro / S", "Beige / M", "Beige / XL"];
  assert.deepEqual(lista.sort(compararOpciones), ["Beige / S", "Beige / M", "Beige / XL", "Beige / XXL", "Negro / S", "Negro / L"]);
});
