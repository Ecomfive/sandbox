import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenarVariantes } from "./orden-variantes";

test("ascendente deja el orden de siempre y descendente lo invierte, sin tocar la lista original", () => {
  const tallas = ["L", "M", "S", "XL", "2XL"];
  assert.deepEqual(ordenarVariantes(tallas, false), tallas);
  assert.deepEqual(ordenarVariantes(tallas, true), ["2XL", "XL", "S", "M", "L"]);
  assert.deepEqual(tallas, ["L", "M", "S", "XL", "2XL"]);
});
