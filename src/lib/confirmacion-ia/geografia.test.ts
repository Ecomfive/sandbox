import assert from "node:assert/strict";
import test from "node:test";
import { CORREGIMIENTOS_DISTRITO_PANAMA, geografiaDe, geografiaDePanama, LUGARES_FUERA_DEL_MAPA_PANAMA, LUGARES_SERVIENTREGA_PANAMA, ZONAS_DELIVERY_PANAMA, ZONAS_EN_DISCUSION, ZONAS_PAGO_ADELANTADO_PANAMA } from "./geografia";
import { normalizarTexto } from "./zonas";

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
  assert.ok(geografiaDe("CR")?.includes("COSTA RICA"));
  assert.equal(geografiaDe("MX"), null);
});

test("las 6 zonas de delivery, la lista de Servientrega y el pago por adelantado salen en la geografía", () => {
  const g = geografiaDePanama();
  assert.equal(ZONAS_DELIVERY_PANAMA.length, 6);
  assert.deepEqual(ZONAS_DELIVERY_PANAMA.map((z) => z.zona), [1, 2, 3, 4, 5, 6]);
  for (const z of ZONAS_DELIVERY_PANAMA) assert.ok(g.includes(`Zona ${z.zona} (`));
  for (const lugar of ["Costa del Este", "Villa Lucre", "Condado del Rey", "Punta Pacífica", "Tocumen", "Pacora"]) assert.ok(g.includes(lugar), lugar);
  for (const lugar of LUGARES_SERVIENTREGA_PANAMA) assert.ok(g.includes(lugar), lugar);
  for (const lugar of ZONAS_PAGO_ADELANTADO_PANAMA) assert.ok(g.includes(lugar), lugar);
  assert.match(g, /responde «adelantado»/);
  assert.match(g, /homónimos/);
});

test("lo que está en Servientrega no se repite en el delivery, y lo que está en discusión sale en el delivery o es de los corregimientos que las tiendas etiquetan CIUDAD", () => {
  const delivery = new Set(ZONAS_DELIVERY_PANAMA.flatMap((z) => z.lugares.map(normalizarTexto)));
  for (const lugar of LUGARES_SERVIENTREGA_PANAMA) assert.ok(!delivery.has(normalizarTexto(lugar)), `${lugar} sale en el delivery y en Servientrega sin estar en discusión`);
  const extras = new Set(["Ernesto Córdoba Campos", "Cabra"].map(normalizarTexto));
  for (const lugar of ZONAS_EN_DISCUSION) assert.ok(delivery.has(normalizarTexto(lugar)) || extras.has(normalizarTexto(lugar)), `${lugar} no está en ninguna zona de delivery`);
  assert.equal(new Set(ZONAS_EN_DISCUSION.map(normalizarTexto)).size, ZONAS_EN_DISCUSION.length);
});

test("el mapa del equipo: lo de dentro es ciudad, lo de fuera es interior, y el orden para decidir está dicho", () => {
  const g = geografiaDePanama();
  assert.match(g, /MAPA DEL EQUIPO/);
  assert.match(g, /Isla Naos, Isla Flamenco/);
  for (const lugar of LUGARES_FUERA_DEL_MAPA_PANAMA) assert.ok(g.includes(lugar), lugar);
  assert.match(g, /ORDEN PARA DECIDIR LA ZONA/);
  assert.match(g, /Las zonas 5 y 6 .* también son CIUDAD/);
  // Nada de lo que el mapa deja afuera está en una zona de delivery.
  const delivery = new Set(ZONAS_DELIVERY_PANAMA.flatMap((z) => z.lugares.map(normalizarTexto)));
  for (const lugar of LUGARES_FUERA_DEL_MAPA_PANAMA) assert.ok(!delivery.has(normalizarTexto(lugar)), `${lugar} está en el delivery y fuera del mapa`);
});
