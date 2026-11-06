import assert from "node:assert/strict";
import { test } from "node:test";
import { armarCuadro, diaSiguiente, resumenCuadro, ventaNeta } from "./cuadro-plataformas";

const vacio = { cortes: new Map<string, number>(), remisiones: [], ventas: [], dice: new Map<string, number>() };

test("corte + entró − vendido = debería haber, contra lo que dice la plataforma", () => {
  const [f] = armarCuadro({
    cortes: new Map([["a", 100]]),
    remisiones: [{ sku: "a", estado: "recibido", enviada: 50, recibida: 48 }],
    ventas: [{ sku: "a", pedidas: 30, canceladas: 5, rechazadas: 1, devueltas: 4 }],
    dice: new Map([["a", 120]]),
  });
  assert.deepEqual(f, { sku: "a", corte: 100, entro: 48, enCamino: 0, vendido: 20, deberia: 128, dice: 120, diferencia: -8 });
});

test("lo que sigue en camino no cuenta, pero se ve", () => {
  const [f] = armarCuadro({ ...vacio, cortes: new Map([["a", 10]]), remisiones: [{ sku: "a", estado: "enviado", enviada: 50, recibida: null }], dice: new Map([["a", 10]]) });
  assert.equal(f.enCamino, 50);
  assert.equal(f.deberia, 10);
  assert.equal(f.diferencia, 0);
});

test("mercancía sin corte ni remisión sale como sobrante", () => {
  const [f] = armarCuadro({ ...vacio, dice: new Map([["a", 379]]) });
  assert.equal(f.diferencia, 379);
});

test("lo que está todo en cero no sale, y lo que más difiere va primero", () => {
  const filas = armarCuadro({ ...vacio, cortes: new Map([["a", 10], ["b", 10], ["c", 0]]), dice: new Map([["a", 9], ["b", 40]]) });
  assert.deepEqual(filas.map((f) => f.sku), ["b", "a"]);
});

test("el resumen cuenta productos y unidades", () => {
  const filas = armarCuadro({ ...vacio, cortes: new Map([["a", 10], ["b", 10], ["c", 10]]), dice: new Map([["a", 10], ["b", 4], ["c", 13]]) });
  assert.deepEqual(resumenCuadro(filas), { cuadran: 1, conDiferencia: 2, sobran: 3, faltan: 6 });
});

test("la venta neta y el día siguiente al corte", () => {
  assert.equal(ventaNeta({ pedidas: 10, canceladas: 1, rechazadas: 2, devueltas: 3 }), 4);
  assert.equal(diaSiguiente("2026-10-31"), "2026-11-01");
});
