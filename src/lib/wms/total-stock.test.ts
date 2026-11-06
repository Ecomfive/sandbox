import assert from "node:assert/strict";
import { test } from "node:test";
import { conStockPrimero, sumaSinCompuestos } from "./total-stock";

test("el total no cuenta dos veces lo de los compuestos", () => {
  const filas = [
    { tipo: "simple", fisico: 100 },
    { tipo: "simple", fisico: 50 },
    { tipo: "combo", fisico: 25 },
  ];
  assert.equal(sumaSinCompuestos(filas, (f) => f.fisico), 150);
  assert.equal(sumaSinCompuestos([], () => 1), 0);
});

test("primero los negativos, luego lo que tiene stock y al final lo que está en cero", () => {
  const filas = [
    { codigo: "A", fisico: 0 },
    { codigo: "B", fisico: 5 },
    { codigo: "C", fisico: -2 },
    { codigo: "D", fisico: 0 },
    { codigo: "E", fisico: 1 },
  ];
  assert.deepEqual(conStockPrimero(filas).map((f) => f.codigo), ["C", "B", "E", "A", "D"]);
  assert.deepEqual(conStockPrimero(filas, (f) => (f.codigo === "D" ? 9 : 0)).map((f) => f.codigo), ["C", "B", "D", "E", "A"]);
  assert.equal(filas[0].codigo, "A");
});
