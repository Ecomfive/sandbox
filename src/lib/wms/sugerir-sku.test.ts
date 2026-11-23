import { test } from "node:test";
import assert from "node:assert/strict";
import { cantidadEnNombre, distintivosDeNombre, prefijoDePack, primeroLibre, sugerirSku, sugerirSkuCompuesto, sugerirSkuVariante } from "./sugerir-sku";

test("un pack que choca lleva la palabra de su cantidad, no un número", () => {
  const usados = new Set(["PACKS/CREMA/NIDA"]);
  assert.equal(primeroLibre("PACKS/CREMA/NIDA", (c) => usados.has(c), 4), "PACKS/CREMA/NIDA/CUARTETO");
  // Sin choque no se agrega nada, ni siquiera con cantidad.
  assert.equal(primeroLibre("PACKS/CREMA/OTRA", (c) => usados.has(c), 4), "PACKS/CREMA/OTRA");
  // Si la palabra ya está tomada o no se sabe la cantidad, vuelve al número.
  usados.add("PACKS/CREMA/NIDA/CUARTETO");
  assert.equal(primeroLibre("PACKS/CREMA/NIDA", (c) => usados.has(c), 4), "PACKS/CREMA/NIDA/2");
  assert.equal(primeroLibre("PACKS/CREMA/NIDA", (c) => usados.has(c)), "PACKS/CREMA/NIDA/2");
});

test("cantidad que dice el nombre de un pack", () => {
  assert.equal(cantidadEnNombre("Crema Nida Pack 3"), 3);
  assert.equal(cantidadEnNombre("Crema Nida x3"), 3);
  assert.equal(cantidadEnNombre("Crema Nida Pack de 4"), 4);
  assert.equal(cantidadEnNombre("Crema Nida 3x1"), 3);
  assert.equal(cantidadEnNombre("Crema Nida 30g"), null);
  assert.equal(cantidadEnNombre("Crema Nida"), null);
});

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
  // Un pack por cantidad del mismo producto no lleva la cantidad en el SKU (X2, PACK/2, 2x1, x3, «de 2», «por 3»).
  assert.equal(sugerirSku("Creatina For Women PACK-2", 3, { compuesto: true }), "COMBO/CREATINA/FOR/WOMEN");
  assert.equal(sugerirSku("Super PROMO 2x1 Shampoo Anticaspa Hoegoa", 3, { compuesto: true }), "COMBO/SUPER/PROMO/SHAMPOO");
  assert.equal(sugerirSku("Espuma de Depilación ELHOOE Pack de 2", 3, { compuesto: true }), "COMBO/ESPUMA/DEPILACION/ELHOOE");
  assert.equal(sugerirSku("Seapuri Tratamiento capilar x3", 3, { compuesto: true }), "COMBO/SEAPURI/TRATAMIENTO/CAPILAR");
  assert.equal(sugerirSku("Crema Perfectx Terapia Articular 30g PACK 2", 3, { compuesto: true }), "COMBO/CREMA/PERFECTX/TERAPIA");
  assert.equal(sugerirSku("Combo", 3, { compuesto: true }), "COMBO");
  assert.equal(sugerirSku("", 3, { compuesto: true }), "");
  // Un producto simple no cambia, ni siquiera si su nombre dice «combo».
  assert.equal(sugerirSku("Combo Aceite de Orégano"), "COMBO/ACEITE/OREGANO");
  assert.equal(sugerirSku("Crema Nida"), "CREMA/NIDA");
});

test("PACK si son 2 unidades del mismo producto, PACKS si son 3 o más, COMBO si no se sabe", () => {
  assert.equal(prefijoDePack(2), "PACK");
  assert.equal(prefijoDePack(3), "PACKS");
  assert.equal(prefijoDePack(6), "PACKS");
  assert.equal(prefijoDePack(1), "COMBO");
  assert.equal(prefijoDePack(null), "COMBO");
});

test("un compuesto de un solo producto lleva PACK o PACKS y el SKU de ese producto", () => {
  assert.equal(sugerirSkuCompuesto({ nombre: "Crema Nida Pack 2", componentes: [{ codigo: "CREMA/NIDA", cantidad: 2 }] }), "PACK/CREMA/NIDA");
  assert.equal(sugerirSkuCompuesto({ nombre: "", componentes: [{ codigo: "crema/nida", cantidad: 3 }] }), "PACKS/CREMA/NIDA");
  assert.equal(sugerirSkuCompuesto({ nombre: "", componentes: [{ codigo: "MAGNESIUM/COMPLEX/TOPLUX/60", cantidad: 2 }] }), "PACK/MAGNESIUM/COMPLEX/TOPLUX/60");
});

test("un combo de productos distintos une el SKU de cada uno con «+»", () => {
  assert.equal(sugerirSkuCompuesto({ nombre: "x", componentes: [{ codigo: "TRULY/GLAZED", cantidad: 1 }, { codigo: "ESPUMA/EELHOE", cantidad: 1 }] }), "COMBO/TRULY/GLAZED+ESPUMA/EELHOE");
  // Muy largo: cada SKU se acorta a sus primeros tramos.
  const largo = sugerirSkuCompuesto({
    nombre: "x",
    componentes: [{ codigo: "OXIDO/NITRICO/SHILAJIT/CAPSULAS/120/NATURAL", cantidad: 1 }, { codigo: "MAGNESIUM/COMPLEX/TOPLUX/CAPSULAS/60/VERDE", cantidad: 1 }],
  });
  assert.ok(largo.length <= 80, largo);
  assert.match(largo, /^COMBO\/OXIDO\/NITRICO\/SHILAJIT\+MAGNESIUM\/COMPLEX\/TOPLUX$/);
});

test("sin productos elegidos, el prefijo sale de la cantidad que diga el nombre", () => {
  assert.equal(sugerirSkuCompuesto({ nombre: "Crema Nida Pack 3" }), "PACKS/CREMA/NIDA");
  assert.equal(sugerirSkuCompuesto({ nombre: "Crema Nida 2x1" }), "PACK/CREMA/NIDA");
  assert.equal(sugerirSkuCompuesto({ nombre: "Crema Nida" }), "COMBO/CREMA/NIDA");
  assert.equal(sugerirSkuCompuesto({ nombre: "" }), "");
  // «packs» tampoco se repite desde el nombre.
  assert.equal(sugerirSku("Packs Crema Nida", 3, { compuesto: true, prefijo: "PACKS" }), "PACKS/CREMA/NIDA");
});
