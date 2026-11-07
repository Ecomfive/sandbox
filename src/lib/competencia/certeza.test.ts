import assert from "node:assert/strict";
import { test } from "node:test";
import { certezaIgual } from "./certeza";

test("otro producto con un nombre parecido es dudoso, no más barato que nosotros", () => {
  assert.equal(certezaIgual("Shilajit en Capsulas 8 en 1", "Cápsulas de Shilajit 100 Puro del Himalaya 92 Minerales 30 Cápsulas", "nombre"), "dudoso");
  assert.equal(certezaIgual("Magnesium Complex Top Lux 90 cápsulas", "Magnesium 5x complex", "nombre"), "dudoso");
  assert.equal(certezaIgual("CREMA HIDRATANTE NIDA", "CREMA NIDA", "nombre"), "dudoso");
  assert.equal(certezaIgual("Truly Soft Serve", "TRULY ACEITE 90ML - SOFT SERVE", "nombre"), "dudoso");
});

test("el mismo nombre, aunque cambien mayúsculas, acentos, orden o palabras de relleno, es exacto", () => {
  assert.equal(certezaIgual("Lemme burn", "LEMME BURN", "nombre"), "exacto");
  assert.equal(certezaIgual("Desodorante Deos", "DEOS DESODORANTE NATURAL", "nombre"), "exacto");
  assert.equal(certezaIgual("URO PROBIÓTICO VAGINAL", "URO (PROBIÓTICOS VAGINALES)", "nombre"), "exacto");
  assert.equal(certezaIgual("SPRAY DR. MELAXIN PEEL SHOT", "ECOM TRAVEL - DR. MELAXIN PEEL SHOT SPRAY", "nombre"), "exacto");
  assert.equal(certezaIgual("CANDIDA CLEANSE", "Candida Cleanse 60 cápsulas", "nombre"), "exacto");
});

test("otro tamaño u otra cantidad no es el mismo producto", () => {
  assert.equal(certezaIgual("Hair Growth 60 cápsulas", "Hair Growth 120 cápsulas", "nombre"), "dudoso");
  assert.equal(certezaIgual("Lemme Burn", "Lemme Burn PACK 2", "nombre"), "dudoso");
  assert.equal(certezaIgual("Crema Nida 50 ml", "Crema Nida 50 g", "foto"), "dudoso");
});

test("con la misma foto basta que un nombre esté contenido en el otro", () => {
  assert.equal(certezaIgual("Lemme burn", "Lemme Burn Cápsulas para Activar el Metabolismo 60 Cápsulas", "foto"), "exacto");
  assert.equal(certezaIgual("Shilajit en Capsulas 8 en 1", "Shilajit 92 minerales", "foto"), "dudoso");
  assert.equal(certezaIgual("Blood Sugar Complex", "Blood Sugar Complex, Toplux, 60 Caps.", "nombre"), "dudoso");
  assert.equal(certezaIgual("Blood Sugar Complex", "Blood Sugar Complex, Toplux, 60 Caps.", "foto"), "exacto");
});

test("la foto cuenta aunque se hayan emparejado por nombre", () => {
  const h = "0f0f0f0f0f0f0f0f";
  assert.equal(certezaIgual({ nombre: "Lemme burn", huella: h }, { nombre: "Quemador Lemme Burn", huella: h }, "nombre"), "exacto");
  assert.equal(certezaIgual({ nombre: "Lemme burn", huella: h }, { nombre: "Quemador Lemme Burn", huella: "f0f0f0f0f0f0f0f0" }, "nombre"), "dudoso");
  assert.equal(certezaIgual({ nombre: "Lemme burn" }, { nombre: "Quemador Lemme Burn" }, "nombre"), "dudoso");
  // La misma foto no salva un tamaño o un número distinto.
  assert.equal(certezaIgual({ nombre: "Hair Growth 60 cápsulas", huella: h }, { nombre: "Hair Growth 120 cápsulas", huella: h }, "nombre"), "dudoso");
  assert.equal(certezaIgual({ nombre: "Shilajit en Capsulas 8 en 1", huella: h }, { nombre: "Shilajit 92 minerales", huella: h }, "nombre"), "dudoso");
});

test("sin palabras que comparar no se da por igual", () => {
  assert.equal(certezaIgual("Pack 2", "Pack 2", "nombre"), "dudoso");
});
