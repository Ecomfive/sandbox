import assert from "node:assert/strict";
import { test } from "node:test";
import { sinStockParaArchivar } from "./archivar";

test("sin stock en Dropi no se archiva; sin lectura o con unidades, sí", () => {
  assert.equal(sinStockParaArchivar(0), true);
  assert.equal(sinStockParaArchivar(0, 0), true);
  assert.equal(sinStockParaArchivar(-2, null), true);
  assert.equal(sinStockParaArchivar(50), false);
  assert.equal(sinStockParaArchivar(0, 3), false, "con unidades reservadas a un dropshipper todavía tiene stock");
  assert.equal(sinStockParaArchivar(null), false, "sin lectura de stock no se impide");
});
