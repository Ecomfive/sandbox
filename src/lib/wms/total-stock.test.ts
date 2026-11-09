import assert from "node:assert/strict";
import { test } from "node:test";
import { conStockPrimero, existencia, sumaSinCompuestos } from "./total-stock";

test("el total no cuenta dos veces lo de los compuestos", () => {
  const filas = [
    { tipo: "simple", fisico: 100 },
    { tipo: "simple", fisico: 50 },
    { tipo: "combo", fisico: 25 },
  ];
  assert.equal(sumaSinCompuestos(filas, (f) => f.fisico), 150);
  assert.equal(sumaSinCompuestos([], () => 1), 0);
});

test("primero los negativos, luego lo que tiene stock de mayor a menor y al final lo que está en cero", () => {
  const filas = [
    { codigo: "A", fisico: 0 },
    { codigo: "B", fisico: 5 },
    { codigo: "C", fisico: -2 },
    { codigo: "D", fisico: 0 },
    { codigo: "E", fisico: 1 },
  ];
  assert.deepEqual(conStockPrimero(filas).map((f) => f.codigo), ["C", "B", "E", "A", "D"]);
  // Con unidades en una plataforma, D ya no está en cero: va entre lo que tiene stock, después de lo que tiene unidades en bodega.
  assert.deepEqual(conStockPrimero(filas, (f) => (f.codigo === "D" ? 9 : 0)).map((f) => f.codigo), ["C", "B", "E", "D", "A"]);
  assert.equal(filas[0].codigo, "A");
});

test("lo que hay en las plataformas también es stock", () => {
  assert.equal(existencia(0), "sin_stock");
  assert.equal(existencia(0, 745), "con_stock");
  assert.equal(existencia(12), "con_stock");
  assert.equal(existencia(12, 0), "con_stock");
  assert.equal(existencia(-3, 100), "negativo");
});

test("lo que más stock tiene va primero; el más negativo antes; los empates, por lo que tienen en plataformas", () => {
  const filas = [
    { codigo: "A", fisico: 100 },
    { codigo: "B", fisico: 431 },
    { codigo: "C", fisico: -1 },
    { codigo: "D", fisico: -9 },
    { codigo: "E", fisico: 100 },
    { codigo: "F", fisico: 420 },
  ];
  assert.deepEqual(conStockPrimero(filas, (f) => (f.codigo === "E" ? 50 : 0)).map((f) => f.codigo), ["D", "C", "B", "F", "E", "A"]);
});
