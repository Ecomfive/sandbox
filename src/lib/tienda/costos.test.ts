import assert from "node:assert/strict";
import test from "node:test";
import { cuentasDelPedido, type CostoProducto } from "./costos";

const costos = new Map<string, CostoProducto>([
  ["a", { costo: 3.73, fuente: "dropi" }],
  ["b", { costo: 2, fuente: "compra" }],
]);

test("ingresos y costos: costo por cantidad, sin servicios; margen con lo que se sabe", () => {
  const c = cuentasDelPedido(
    32.9,
    [
      { skuId: "a", cantidad: 2, esServicio: false },
      { skuId: "b", cantidad: 1, esServicio: false },
      { skuId: null, cantidad: 1, esServicio: true },
    ],
    costos,
    null,
    5.15,
  );
  assert.equal(c.costoProductos, 9.46);
  assert.equal(c.lineasSinCosto, 0);
  assert.deepEqual(c.fuentes.sort(), ["compra", "dropi"]);
  assert.equal(c.margen, 18.29);
  assert.equal(c.margenPct, 55.6);
});

test("ingresos y costos: una línea sin producto o sin costo se cuenta aparte; sin nada costeado no hay margen", () => {
  const parcial = cuentasDelPedido(20, [{ skuId: "a", cantidad: 1, esServicio: false }, { skuId: "x", cantidad: 1, esServicio: false }], costos, 1.5, null);
  assert.equal(parcial.lineasSinCosto, 1);
  assert.equal(parcial.margen, 14.77);
  const nada = cuentasDelPedido(20, [{ skuId: null, cantidad: 1, esServicio: false }], costos, null, null);
  assert.equal(nada.margen, null);
  assert.equal(nada.margenPct, null);
});
