import assert from "node:assert/strict";
import { test } from "node:test";
import { puntosParaDecidir, type ProductoParaDecidir } from "./para-decidir";

const base: ProductoParaDecidir = {
  clase: "fisico",
  foto: "https://x/f.jpg",
  categoria: { revisar: false },
  compras: { ordenes: 2 },
  asociaciones: [{}],
  nombresDropi: [],
  tests: [],
  stockDropi: 300,
};
const puntos = (p: Partial<ProductoParaDecidir>) => puntosParaDecidir({ ...base, ...p });

test("un activo completo no tiene nada por decidir", () => {
  assert.deepEqual(puntos({}), []);
});

test("foto, conexión, compras y categoría de un activo", () => {
  assert.deepEqual(puntos({ foto: null }), ["sin_foto"]);
  assert.deepEqual(puntos({ asociaciones: [], nombresDropi: [] }), ["sin_conectar"]);
  assert.deepEqual(puntos({ asociaciones: [], nombresDropi: [{}] }), []);
  assert.deepEqual(puntos({ compras: { ordenes: 0 } }), ["nunca_comprado"]);
  assert.deepEqual(puntos({ categoria: null }), ["categoria_revisar"]);
  assert.deepEqual(puntos({ categoria: { revisar: true } }), ["categoria_revisar"]);
});

test("stock en Dropi: sin stock, bajo, o sin lectura", () => {
  assert.deepEqual(puntos({ stockDropi: 0 }), ["sin_stock"]);
  assert.deepEqual(puntos({ stockDropi: 49 }), ["stock_bajo"]);
  assert.deepEqual(puntos({ stockDropi: 50 }), []);
  assert.deepEqual(puntos({ stockDropi: null }), []);
});

test("winner sin comprar: activo o en test; los inactivos no", () => {
  const winner = { tests: [{ estado: "winner" }], compras: { ordenes: 0 } };
  assert.ok(puntos(winner).includes("winner_sin_comprar"));
  assert.deepEqual(puntos({ ...winner, clase: "test" }), ["winner_sin_comprar"]);
  assert.deepEqual(puntos({ clase: "test", tests: [{ estado: "enviado_a_compras" }], compras: { ordenes: 0 } }), ["winner_sin_comprar"]);
  assert.deepEqual(puntos({ ...winner, clase: "inactivo" }), []);
  assert.ok(!puntos({ tests: [{ estado: "winner" }] }).includes("winner_sin_comprar"));
  assert.deepEqual(puntos({ clase: "test", tests: [{ estado: "fallido" }], compras: { ordenes: 0 } }), []);
});

test("un producto en test, inactivo o descontinuado no cuenta en los puntos de activos", () => {
  assert.deepEqual(puntos({ clase: "test", foto: null, asociaciones: [], compras: { ordenes: 0 }, categoria: null, stockDropi: 0 }), []);
  assert.deepEqual(puntos({ clase: "inactivo", foto: null }), []);
});
