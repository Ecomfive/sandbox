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
  assert.equal(tendenciaDeTienda("Kenku Panamá"), null, "la tendencia de Kenku ya no se sigue");
  assert.equal(tendenciaDeTienda("OFERFY")?.nombre, "Oferfy");
  assert.equal(tendenciaDeTienda("Nuvo")?.nombre, "Nuvo");
  assert.equal(tendenciaDeTienda("Wao Ofertas"), null);
  assert.equal(tendenciaDeTienda(null), null);
});

test("Kenku ya no tiene tendencia: la IA sigue los documentos y lo que etiquetan Nuvo y Oferfy", () => {
  assert.ok(!TENDENCIAS_PANAMA.some((t) => t.clave === "kenku"));
  const n = textoTendencia(tendenciaDeTienda("Nuvo")!);
  assert.match(n, /Tocumen → CIUDAD \(14 ciudad \/ 0 interior\)/);
  assert.match(n, /responde «no_se»/);
  assert.match(textoTendencia(tendenciaDeTienda("Oferfy")!), /Panamá Norte → mixto/);
});

test("cada tienda tiene sus lugares sin repetir", () => {
  for (const t of TENDENCIAS_PANAMA) assert.equal(new Set(t.lugares.map((l) => l.lugar)).size, t.lugares.length, t.nombre);
});

test("el texto de la tendencia manda al reglamento cuando el lugar es mixto o no está", () => {
  const t = textoTendencia(tendenciaDeTienda("Nuvo")!);
  assert.match(t, /manda el reglamento/);
  assert.match(t, /dentro del mapa son CIUDAD/);
});
