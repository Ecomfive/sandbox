import assert from "node:assert/strict";
import test from "node:test";
import { etapaEfectiva, indexarCatalogo, palabrasDeProducto, productoDeCampana } from "./etapa-venta";

const catalogo = indexarCatalogo([
  { nombre: "Aceite Veganic Oil", clase: "fisico" },
  { nombre: "Aceite de Batana y Romero 30ml", clase: "fisico" },
  { nombre: "Astaxantina 12mg", clase: "test" },
  { nombre: "Complejo Natural de NAD", clase: "test" },
  { nombre: "Cargador Multifuncional 5en1 para Auto", clase: "fisico" },
  { nombre: "Herbaplant Ashwagandha", clase: "inactivo" },
  { nombre: "Candida Cleanse", clase: "fisico" },
  { nombre: "Candida Cleanse Plus", clase: "test" },
]);

test("los códigos del equipo (EO, RA, PRUEBA) y el relleno no cuentan como palabras del producto", () => {
  assert.deepEqual(palabrasDeProducto("RA EO ACEITE DE BATANA"), ["aceite", "batana"]);
  assert.deepEqual(palabrasDeProducto("PRUEBA Orégano"), ["oregano"]);
});

test("se reconoce el producto cuando todas las palabras de la campaña están en su nombre", () => {
  assert.equal(productoDeCampana("EO ACEITE VEGANIC", catalogo)?.nombre, "Aceite Veganic Oil");
  assert.equal(productoDeCampana("ACEITE BATANA", catalogo)?.nombre, "Aceite de Batana y Romero 30ml");
  assert.equal(productoDeCampana("ASHWAGANDHA", catalogo)?.nombre, "Herbaplant Ashwagandha");
});

test("no se inventa un producto: una palabra que no está, o solo palabras cortas, no reconocen nada", () => {
  assert.equal(productoDeCampana("COLAGENO 5EN1", catalogo), null);
  assert.equal(productoDeCampana("EO", catalogo), null);
  assert.equal(productoDeCampana(null, catalogo), null);
  assert.equal(productoDeCampana("ACEITE MAGIC", catalogo), null);
});

test("si dos productos calzan gana el de nombre más corto, y a igual parecido el que ya no es de Test", () => {
  assert.equal(productoDeCampana("CANDIDA CLEANSE", catalogo)?.test, false);
  assert.equal(productoDeCampana("CANDIDA CLEANSE", catalogo)?.nombre, "Candida Cleanse");
});

test("la etapa efectiva: a mano manda, Escala y Retargeting se respetan, Test sigue Testing y lo demás es Ventas", () => {
  const activo = { nombre: "Aceite Veganic Oil", test: false };
  const enTest = { nombre: "Astaxantina 12mg", test: true };
  assert.equal(etapaEfectiva({ delNombre: "testing", manual: true, producto: activo }).etapa, "testing");
  assert.equal(etapaEfectiva({ delNombre: "escala", manual: false, producto: enTest }).etapa, "escala");
  assert.equal(etapaEfectiva({ delNombre: "retargeting", manual: false, producto: activo }).etapa, "retargeting");
  assert.equal(etapaEfectiva({ delNombre: "testing", manual: false, producto: enTest }).etapa, "testing");
  assert.equal(etapaEfectiva({ delNombre: "testing", manual: false, producto: activo }).etapa, "venta");
  assert.equal(etapaEfectiva({ delNombre: "testing", manual: false, producto: null }).etapa, "venta");
  assert.equal(etapaEfectiva({ delNombre: null, manual: false, producto: null }).etapa, "venta");
  assert.match(etapaEfectiva({ delNombre: "testing", manual: false, producto: activo }).motivo, /ya salió de Test/);
});
