import assert from "node:assert/strict";
import { test } from "node:test";
import { ajustesDropi, objetivoPorProducto } from "./sync-dropi";

test("suma los IDs de cada producto una vez y deja fuera los que no vinieron en la lectura", () => {
  const stock = new Map([["1", 10], ["2", 5], ["3", 0]]);
  const o = objetivoPorProducto(
    [
      { skuId: "a", dropiIds: ["1", "2"] },
      { skuId: "a", dropiIds: ["2"] },
      { skuId: "b", dropiIds: ["3"] },
      { skuId: "c", dropiIds: ["99"] },
    ],
    stock,
  );
  assert.deepEqual([...o], [["a", 15], ["b", 0]]);
});

test("solo ajusta lo que cambió, con la diferencia", () => {
  assert.deepEqual(ajustesDropi(new Map([["a", 15], ["b", 0], ["c", 4]]), new Map([["a", 20], ["c", 4]])), [{ skuId: "a", delta: -5 }]);
});
