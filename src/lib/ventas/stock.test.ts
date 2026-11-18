import assert from "node:assert/strict";
import test from "node:test";
import { unidadesPorProducto } from "./stock";

test("lo que sale de bodega: los combos por sus componentes y los repetidos sumados", () => {
  const combos = new Map([["combo", [{ skuId: "a", cantidad: 2 }, { skuId: "b", cantidad: 1 }]]]);
  const r = unidadesPorProducto(
    [
      { skuId: "a", cantidad: 6 },
      { skuId: "combo", cantidad: 2 },
    ],
    combos,
  );
  assert.deepEqual([...r], [["a", 10], ["b", 2]]);
});
