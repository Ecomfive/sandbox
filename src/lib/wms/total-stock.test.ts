import assert from "node:assert/strict";
import { test } from "node:test";
import { sumaSinCompuestos } from "./total-stock";

test("el total no cuenta dos veces lo de los compuestos", () => {
  const filas = [
    { tipo: "simple", fisico: 100 },
    { tipo: "simple", fisico: 50 },
    { tipo: "combo", fisico: 25 },
  ];
  assert.equal(sumaSinCompuestos(filas, (f) => f.fisico), 150);
  assert.equal(sumaSinCompuestos([], () => 1), 0);
});
