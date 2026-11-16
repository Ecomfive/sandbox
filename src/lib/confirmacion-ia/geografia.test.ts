import assert from "node:assert/strict";
import test from "node:test";
import { CORREGIMIENTOS_DISTRITO_PANAMA, geografiaDe, geografiaDePanama } from "./geografia";

test("la geografía de Panamá trae las provincias, el distrito de Panamá y lo que se deja como dudoso", () => {
  const g = geografiaDePanama();
  for (const lugar of ["Panamá Oeste", "Colón", "Chiriquí", "Bella Vista", "San Francisco", "Tocumen", "San Miguelito"]) assert.ok(g.includes(lugar), lugar);
  assert.match(g, /responde «no_se»/);
  assert.match(g, /«Panamá Oeste» y «Panamá Este».*NO son ciudad/);
});

test("el distrito de Panamá tiene sus 26 corregimientos, con los dos creados en 2017", () => {
  assert.equal(CORREGIMIENTOS_DISTRITO_PANAMA.length, 26);
  assert.equal(new Set(CORREGIMIENTOS_DISTRITO_PANAMA).size, 26);
  for (const c of ["Las Garzas", "Don Bosco", "Caimitillo", "Ernesto Córdoba Campos"]) assert.ok(CORREGIMIENTOS_DISTRITO_PANAMA.includes(c), c);
});

test("solo hay geografía de los países que se tienen", () => {
  assert.equal(geografiaDe("pa"), geografiaDePanama());
  assert.equal(geografiaDe("CR"), null);
});
