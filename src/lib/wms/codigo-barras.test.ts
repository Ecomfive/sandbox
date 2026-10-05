import assert from "node:assert/strict";
import { test } from "node:test";
import { digitoControl, esCodigoBarrasValido, esCodigoInterno, modulosEan, normalizarCodigoBarras, svgCodigoBarras } from "./codigo-barras";

// Se corre con: npm run test:seguridad (incluye estas pruebas de los códigos de barras)
// Los códigos de ejemplo son los que usa GS1 y Wikipedia para explicar el cálculo.

test("calcula el dígito de control de un EAN-13, un EAN-8 y un UPC-A", () => {
  assert.equal(digitoControl("400638133393"), 1); // EAN-13 4006381333931
  assert.equal(digitoControl("7351353"), 7); // EAN-8 73513537
  assert.equal(digitoControl("03600029145"), 2); // UPC-A 036000291452
});

test("valida los largos y el dígito de control", () => {
  assert.ok(esCodigoBarrasValido("4006381333931"));
  assert.ok(esCodigoBarrasValido("73513537"));
  assert.ok(esCodigoBarrasValido("036000291452"));
  assert.ok(!esCodigoBarrasValido("4006381333932"), "dígito de control equivocado");
  assert.ok(!esCodigoBarrasValido("12345"), "largo no válido");
  assert.ok(!esCodigoBarrasValido("40063813339A1"), "con letras");
});

test("deja solo los números de lo que se escribe o se escanea", () => {
  assert.equal(normalizarCodigoBarras(" 400-6381 333931\n"), "4006381333931");
  assert.equal(normalizarCodigoBarras(null), "");
});

test("un código interno es un EAN-13 válido con prefijo 20", () => {
  const base = "200000000001";
  const codigo = `${base}${digitoControl(base)}`;
  assert.equal(codigo.length, 13);
  assert.ok(esCodigoInterno(codigo));
  assert.ok(!esCodigoInterno("4006381333931"), "uno de fabricante no es interno");
});

test("un EAN-13 se dibuja con 95 módulos, guardas y la paridad del primer dígito", () => {
  const m = modulosEan("4006381333931");
  assert.ok(m);
  assert.equal(m.length, 95);
  assert.ok(m.startsWith("101") && m.endsWith("101"));
  assert.equal(m.slice(45, 50), "01010", "guarda central");
  // El primer dígito (4) manda LGLLGG: el 0 de la izquierda en L es 0001101 y el 0 en G es 0100111.
  assert.equal(m.slice(3, 10), "0001101", "segundo dígito (0) en L");
  assert.equal(m.slice(10, 17), "0100111", "tercer dígito (0) en G");
});

test("un EAN-8 tiene 67 módulos y un UPC-A se dibuja como EAN-13 con un 0 delante", () => {
  assert.equal(modulosEan("73513537")?.length, 67);
  assert.equal(modulosEan("036000291452"), modulosEan("0036000291452"));
});

test("lo que no se puede dibujar (GTIN-14, inválido) devuelve null", () => {
  assert.equal(modulosEan("12345678901231"), null);
  assert.equal(svgCodigoBarras("1234"), null);
  assert.ok(svgCodigoBarras("4006381333931")?.startsWith("<svg"));
});
