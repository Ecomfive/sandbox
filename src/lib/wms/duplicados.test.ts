import assert from "node:assert/strict";
import { test } from "node:test";
import { distanciaHuella, palabrasClave, parecidoNombre, posiblesDuplicados } from "./duplicados";

test("las palabras clave dejan fuera relleno, medidas y acentos", () => {
  assert.deepEqual(palabrasClave("Aceite de Orégano 30ml 2x1"), ["aceite", "oregano"]);
});

test("nombres parecidos", () => {
  assert.equal(parecidoNombre(palabrasClave("Aceite de orégano"), palabrasClave("OreganoOil Aceite de orégano 30ml")), 1);
  assert.ok(parecidoNombre(palabrasClave("Pestañas magnéticas"), palabrasClave("Set de pestañas magnetic")) >= 0.75);
  assert.equal(parecidoNombre(palabrasClave("Crema facial"), palabrasClave("Lámpara solar")), 0);
});

test("distancia entre huellas", () => {
  assert.equal(distanciaHuella("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(distanciaHuella("0000000000000000", "000000000000000f"), 4);
  assert.equal(distanciaHuella("0000", "0000000000000000"), 64);
});

test("avisa por nombre o por foto, el más parecido primero", () => {
  const c = [
    { id: "1", codigo: "ACEITE/OREGANO", nombre: "Aceite de orégano", foto: null, huella: "0000000000000000" },
    { id: "2", codigo: "LAMPARA", nombre: "Lámpara solar", foto: null, huella: "00000000000000ff" },
    { id: "3", codigo: "CREMA", nombre: "Crema facial", foto: null, huella: "ffffffffffffffff" },
  ];
  const r = posiblesDuplicados("OreganoOil aceite orégano", "000000000000000f", c);
  assert.deepEqual(r.map((x) => [x.id, x.porNombre, x.porFoto]), [["1", true, true], ["2", false, true]]);
  // Una sola palabra en común no basta.
  assert.equal(posiblesDuplicados("Crema", null, c).length, 0);
});
