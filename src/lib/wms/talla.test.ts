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
