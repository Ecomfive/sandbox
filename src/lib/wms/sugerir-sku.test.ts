import { test } from "node:test";
import assert from "node:assert/strict";
import { distintivosDeNombre, primeroLibre, sugerirSku, sugerirSkuVariante } from "./sugerir-sku";

test("las palabras del nombre, sin relleno, títulos ni medidas", () => {
  assert.equal(sugerirSku("Bálsamo Púrpura Dr. Melaxin 9g"), "BALSAMO/PURPURA/MELAXIN");
  assert.equal(sugerirSku("Crema Lifting Botox Veneno de Abeja"), "CREMA/LIFTING/BOTOX");
  assert.equal(sugerirSku("Aceite de Oregano 300 capsulas Verde"), "ACEITE/OREGANO/CAPSULAS/300/VERDE");
  assert.equal(sugerirSku("Set De Pestañas Magneticas"), "SET/PESTANAS/MAGNETICAS");
  assert.equal(sugerirSku("2x1 Escoba 3 en 1"), "ESCOBA");
  assert.equal(sugerirSku(""), "");
});

test("la variante agrega sus valores", () => {
  assert.equal(sugerirSkuVariante("FAJA/BODY/KIM", ["Beige", "L"]), "FAJA/BODY/KIM/BEIGE/L");
  assert.equal(sugerirSkuVariante("BOLSO", ["Púrpura"]), "BOLSO/PURPURA");
});

test("si ya existe, el siguiente libre", () => {
  const usados = new Set(["CREMA", "CREMA/2"]);
  assert.equal(primeroLibre("CREMA", (c) => usados.has(c)), "CREMA/3");
  assert.equal(primeroLibre("ACEITE", (c) => usados.has(c)), "ACEITE");
});

test("el SKU lleva lo que distingue al producto: cápsulas, color y talla", () => {
  assert.equal(sugerirSku("Banda de Ejercicio con Pedales Morado"), "BANDA/EJERCICIO/PEDALES/MORADO");
  assert.equal(sugerirSku("Bolso NAYLA de gran capacidad purpura"), "BOLSO/NAYLA/GRAN/PURPURA");
  assert.equal(sugerirSku("Aceite de Oregano 180 capsulas"), "ACEITE/OREGANO/CAPSULAS/180");
  assert.equal(sugerirSku("Magnesium Complex 60 Capsulas"), "MAGNESIUM/COMPLEX/CAPSULAS/60");
  assert.equal(sugerirSku("Faja Moldeadora Body Talla M Beige"), "FAJA/MOLDEADORA/BODY/M/BEIGE");
  assert.equal(sugerirSku("Camiseta Deportiva Hombre XL Negra"), "CAMISETA/DEPORTIVA/HOMBRE/XL/NEGRA");
});

test("un color o una talla que ya está en el nombre del SKU no se repite", () => {
  assert.equal(sugerirSku("Liga Morada Premium"), "LIGA/MORADA/PREMIUM");
  assert.equal(sugerirSku("Liga Morada"), "LIGA/MORADA");
});

test("no confunde palabras comunes con colores o tallas", () => {
  assert.deepEqual(distintivosDeNombre("Crema Facial Oro Líquido"), []);
  assert.deepEqual(distintivosDeNombre("Set M de Pestañas"), []);
  assert.deepEqual(distintivosDeNombre("Crema 100g Pack 2x1"), []);
  assert.deepEqual(distintivosDeNombre("Aceite 300 ml"), []);
});

test("un SKU muy largo se corta en una barra", () => {
  const largo = sugerirSku("Aceite Esencial Concentrado Lavanda 300 capsulas Verde Oscuro Azul Rojo Negro Blanco Morado Rosa Gris");
  assert.ok(largo.length <= 60);
  assert.ok(!largo.endsWith("/"));
});

test("el SKU de un compuesto (pack o combo) siempre empieza por COMBO, sin repetir «combo» ni «pack» del nombre", () => {
  assert.equal(sugerirSku("Oxido Nítrico + Shilajit 8 EN 1 Regalo", 3, { compuesto: true }), "COMBO/OXIDO/NITRICO/SHILAJIT");
  assert.equal(sugerirSku("Pack x2 Crema Nida", 3, { compuesto: true }), "COMBO/CREMA/NIDA");
  assert.equal(sugerirSku("Combo Aceite de Orégano 300 capsulas Verde", 3, { compuesto: true }), "COMBO/ACEITE/OREGANO/CAPSULAS/300/VERDE");
  assert.equal(sugerirSku("Combo", 3, { compuesto: true }), "COMBO");
  assert.equal(sugerirSku("", 3, { compuesto: true }), "");
  // Un producto simple no cambia, ni siquiera si su nombre dice «combo».
  assert.equal(sugerirSku("Combo Aceite de Orégano"), "COMBO/ACEITE/OREGANO");
  assert.equal(sugerirSku("Crema Nida"), "CREMA/NIDA");
});
