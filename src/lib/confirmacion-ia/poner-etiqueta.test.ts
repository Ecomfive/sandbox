import assert from "node:assert/strict";
import test from "node:test";
import { motivoParaNoEscribir, QUITAR_CONFIRMADA } from "./poner-etiqueta";

const tienda = { estado: "conectada", escribe_shopify: true, ia_pone_etiqueta: true };

test("solo escribe con la tienda conectada y los dos interruptores encendidos", () => {
  assert.equal(motivoParaNoEscribir(tienda, false), null);
  assert.match(motivoParaNoEscribir({ ...tienda, ia_pone_etiqueta: false }, false) ?? "", /La IA pone la etiqueta/);
  assert.match(motivoParaNoEscribir({ ...tienda, escribe_shopify: false }, false) ?? "", /Escribir en Shopify/);
  assert.match(motivoParaNoEscribir({ ...tienda, estado: "por_conectar" }, false) ?? "", /conectada/);
  assert.match(motivoParaNoEscribir(null, false) ?? "", /tienda/);
});

test("un pedido que ya trae etiqueta de zona no se vuelve a etiquetar", () => {
  assert.match(motivoParaNoEscribir(tienda, true) ?? "", /ya tiene etiqueta de zona/);
});

test("en la primera prueba no se quita la etiqueta «Confirmada»", () => {
  assert.equal(QUITAR_CONFIRMADA, false);
});
