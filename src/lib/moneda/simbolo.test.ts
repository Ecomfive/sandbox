import assert from "node:assert/strict";
import { test } from "node:test";
import { montoConSimbolo, montoDePais, simboloDePais, simboloDolarEn } from "./simbolo";

const sinEspacios = (t: string) => t.replace(/\s/g, " ");

test("cada país con su símbolo; el peso no se confunde con el dólar", () => {
  assert.equal(simboloDePais("PA"), "$");
  assert.equal(simboloDePais("cr"), "₡");
  assert.equal(simboloDePais("MX"), "MX$");
  assert.equal(simboloDolarEn("PA"), "$");
  assert.equal(simboloDolarEn("CR"), "US$");
});

test("montos con su símbolo", () => {
  assert.equal(montoConSimbolo(8.99, "USD"), "$8.99");
  assert.equal(montoConSimbolo(-1.2, "USD"), "-$1.20");
  assert.equal(montoConSimbolo(1250000, "USD"), "$1,250,000.00");
  assert.equal(sinEspacios(montoDePais(5499, "CR")), "₡5 499");
  assert.equal(sinEspacios(montoDePais(5499.5, "CR")), "₡5 499,5");
  assert.equal(montoDePais(37.5, "MX"), "MX$37,5");
  assert.equal(montoDePais(null, "PA"), "—");
  assert.equal(sinEspacios(montoDePais(840, "CR", { decimales: 2 })), "₡840,00");
});
