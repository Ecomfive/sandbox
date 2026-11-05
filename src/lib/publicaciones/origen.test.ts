import assert from "node:assert/strict";
import test from "node:test";
import { etiquetaOrigen, faltaParaResolver } from "./origen";

const base = { origen: "dropi" as const, sku: { id: "1" }, costoMercancia: 4.5, archivada: false };

test("una publicación creada en Dropi dice qué le falta", () => {
  assert.deepEqual(faltaParaResolver({ ...base, sku: null, costoMercancia: null }), ["vincular su producto", "poner el costo de mercancía"]);
  assert.deepEqual(faltaParaResolver({ ...base, costoMercancia: 0 }), ["poner el costo de mercancía"]);
  assert.deepEqual(faltaParaResolver({ ...base, sku: null }), ["vincular su producto"]);
});

test("completa, archivada o de otro origen no queda por resolver", () => {
  assert.deepEqual(faltaParaResolver(base), []);
  assert.deepEqual(faltaParaResolver({ ...base, sku: null, archivada: true }), []);
  for (const origen of ["sistema", "carga_inicial", null] as const) assert.deepEqual(faltaParaResolver({ ...base, sku: null, origen }), []);
});

test("la etiqueta de cada origen", () => {
  assert.equal(etiquetaOrigen("dropi"), "Creada en Dropi");
  assert.equal(etiquetaOrigen("sistema"), "Creada en el sistema");
  assert.equal(etiquetaOrigen("carga_inicial"), "Carga inicial");
});
