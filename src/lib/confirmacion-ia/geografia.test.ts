import assert from "node:assert/strict";
import test from "node:test";
import { geografiaDe, geografiaDePanama } from "./geografia";

test("la geografía de Panamá trae las provincias, el distrito de Panamá y lo que se deja como dudoso", () => {
  const g = geografiaDePanama();
  for (const lugar of ["Panamá Oeste", "Colón", "Chiriquí", "Bella Vista", "San Francisco", "Tocumen", "San Miguelito"]) assert.ok(g.includes(lugar), lugar);
  assert.match(g, /responde «no_se»/);
  assert.match(g, /«Panamá Oeste» y «Panamá Este».*NO son ciudad/);
});

test("solo hay geografía de los países que se tienen", () => {
  assert.equal(geografiaDe("pa"), geografiaDePanama());
  assert.equal(geografiaDe("CR"), null);
});
