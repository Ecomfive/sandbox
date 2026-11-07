import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coincideCodigo, numeroProducto, textoCodigos } from "./codigos-producto";

describe("códigos de producto", () => {
  it("el N.º lleva ceros y vacío si no hay", () => {
    assert.equal(numeroProducto(7), "#0007");
    assert.equal(numeroProducto(1234), "#1234");
    assert.equal(numeroProducto(null), "");
    assert.equal(numeroProducto(undefined), "");
  });
  it("los códigos juntos", () => {
    assert.equal(textoCodigos({ numero: 12, barras: "2000000012345" }), "#0012 2000000012345");
    assert.equal(textoCodigos({ numero: null, barras: "7501" }), "7501");
    assert.equal(textoCodigos({}), "");
  });
  it("una búsqueda encuentra por SKU, nombre, N.º (de cualquier forma) o código de barras", () => {
    const c = { numero: 123, barras: "2000000012345" };
    const texto = "BRAGAS/MOLDEADORAS/SEDA Bragas Moldeadoras de Seda";
    assert.equal(coincideCodigo("moldeadoras seda", texto, c), true);
    assert.equal(coincideCodigo("#0123", texto, c), true);
    assert.equal(coincideCodigo("0123", texto, c), true);
    assert.equal(coincideCodigo("123", texto, c), true);
    assert.equal(coincideCodigo("2000000012345", texto, c), true);
    assert.equal(coincideCodigo("12345", texto, c), true);
    assert.equal(coincideCodigo("bragas 123", texto, c), true);
    assert.equal(coincideCodigo("124", texto, c), false);
    assert.equal(coincideCodigo("zapatos", texto, c), false);
    assert.equal(coincideCodigo("", texto, c), true);
    assert.equal(coincideCodigo("123", texto, { numero: null, barras: null }), false);
  });
});
