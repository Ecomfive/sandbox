import assert from "node:assert/strict";
import test from "node:test";
import { normalizarDominio, tokenPlausible } from "./conexion-tienda";

test("el dominio se acepta de varias formas y se rechaza lo raro", () => {
  assert.equal(normalizarDominio("oferfy"), "oferfy.myshopify.com");
  assert.equal(normalizarDominio("https://Oferfy.myshopify.com/admin/orders"), "oferfy.myshopify.com");
  assert.equal(normalizarDominio("evil.com"), null);
  assert.equal(normalizarDominio("a.myshopify.com.evil.com"), null);
  assert.equal(normalizarDominio(""), null);
});

test("el token tiene la forma de Shopify", () => {
  // Se arma al correr: escrito entero, el escáner de secretos de GitHub lo toma por un token real.
  const tokenFalso = ["shpat", "0123456789abcdef".repeat(2)].join("_");
  assert.ok(tokenPlausible(tokenFalso));
  assert.ok(!tokenPlausible("hola"));
});
