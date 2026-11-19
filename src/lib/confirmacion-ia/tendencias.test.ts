import assert from "node:assert/strict";
import test from "node:test";
import { direccionDeLugar, tendenciaDeTienda, TENDENCIAS_PANAMA, textoTendencia } from "./tendencias";

test("un lugar sigue la etiqueta que lleva el 70 % de los casos; si no, es mixto", () => {
  assert.equal(direccionDeLugar({ lugar: "Tocumen", ciudad: 2, interior: 18 }), "interior");
  assert.equal(direccionDeLugar({ lugar: "Tocumen", ciudad: 47, interior: 2 }), "ciudad");
  assert.equal(direccionDeLugar({ lugar: "Panamá Norte", ciudad: 2, interior: 3 }), "mixto");
  assert.equal(direccionDeLugar({ lugar: "Cerro Batea", ciudad: 1, interior: 0 }), "mixto");
});

test("la tienda se reconoce por una palabra de su nombre", () => {
  assert.equal(tendenciaDeTienda("Kenku Panamá")?.nombre, "Kenku");
  assert.equal(tendenciaDeTienda("OFERFY")?.nombre, "Oferfy");
  assert.equal(tendenciaDeTienda("Nuvo")?.nombre, "Nuvo");
  assert.equal(tendenciaDeTienda("Kenkuz"), null);
  assert.equal(tendenciaDeTienda("Wao Ofertas"), null);
  assert.equal(tendenciaDeTienda(null), null);
});

test("Kenku manda a interior lo que Nuvo y Oferfy mandan a ciudad, y el texto lo dice con los casos", () => {
  const k = textoTendencia(tendenciaDeTienda("Kenku")!);
  const n = textoTendencia(tendenciaDeTienda("Nuvo")!);
  assert.match(k, /Tocumen → INTERIOR \(2 ciudad \/ 18 interior\)/);
  assert.match(n, /Tocumen → CIUDAD \(14 ciudad \/ 0 interior\)/);
  assert.match(k, /responde «no_se»/);
  assert.match(textoTendencia(tendenciaDeTienda("Oferfy")!), /Panamá Norte → mixto/);
});

test("cada tienda tiene sus lugares sin repetir", () => {
  for (const t of TENDENCIAS_PANAMA) assert.equal(new Set(t.lugares.map((l) => l.lugar)).size, t.lugares.length, t.nombre);
});
