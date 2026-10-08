import { test } from "node:test";
import assert from "node:assert/strict";
import { primeroLibre, sugerirSku, sugerirSkuVariante } from "./sugerir-sku";

test("las palabras del nombre, sin relleno, títulos ni medidas", () => {
  assert.equal(sugerirSku("Bálsamo Púrpura Dr. Melaxin 9g"), "BALSAMO/PURPURA/MELAXIN");
  assert.equal(sugerirSku("Crema Lifting Botox Veneno de Abeja"), "CREMA/LIFTING/BOTOX");
  assert.equal(sugerirSku("Aceite de Oregano 300 capsulas Verde"), "ACEITE/OREGANO/CAPSULAS");
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
