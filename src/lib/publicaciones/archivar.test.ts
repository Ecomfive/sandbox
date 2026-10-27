import assert from "node:assert/strict";
import { test } from "node:test";
import { listaParaReactivar, sePuedePausar, sinStockParaArchivar } from "./archivar";

test("sin stock en Dropi no se archiva; sin lectura o con unidades, sí", () => {
  assert.equal(sinStockParaArchivar(0), true);
  assert.equal(sinStockParaArchivar(0, 0), true);
  assert.equal(sinStockParaArchivar(-2, null), true);
  assert.equal(sinStockParaArchivar(50), false);
  assert.equal(sinStockParaArchivar(0, 3), false, "con unidades reservadas a un dropshipper todavía tiene stock");
  assert.equal(sinStockParaArchivar(null), false, "sin lectura de stock no se impide");
});

test("se pausa solo lo publicado en Dropi, sin archivar y sin stock", () => {
  const base = { dropiId: "8406", archivada: false, sinPublicar: false, stock: 0, privado: 0 };
  assert.equal(sePuedePausar(base), true);
  assert.equal(sePuedePausar({ ...base, stock: 12 }), false, "con stock se archiva, no se pausa");
  assert.equal(sePuedePausar({ ...base, privado: 4 }), false, "con reserva privada todavía tiene stock");
  assert.equal(sePuedePausar({ ...base, stock: null }), false, "sin lectura de stock no se sabe si se agotó");
  assert.equal(sePuedePausar({ ...base, dropiId: " " }), false, "sin ID no hay nada que archivar en Dropi");
  assert.equal(sePuedePausar({ ...base, archivada: true }), false);
  assert.equal(sePuedePausar({ ...base, sinPublicar: true }), false);
});

test("una pausada se reactiva cuando Dropi vuelve a verle unidades", () => {
  assert.equal(listaParaReactivar(0), false);
  assert.equal(listaParaReactivar(null), false);
  assert.equal(listaParaReactivar(25), true);
  assert.equal(listaParaReactivar(0, 3), true);
});
