import assert from "node:assert/strict";
import test from "node:test";
import { CORREGIMIENTOS_DISTRITO_PANAMA, DUDAS_RESUELTAS_PANAMA, geografiaDe, geografiaDePanama, LUGARES_SERVIENTREGA_PANAMA, NOMBRES_QUE_CONFUNDEN, ZONAS_DELIVERY_PANAMA, ZONAS_PAGO_ADELANTADO_PANAMA } from "./geografia";
import { normalizarTexto } from "./zonas";

test("la geografía de Panamá trae las provincias y el distrito de Panamá", () => {
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
  for (const lugar of ["Costa del Este", "Villa Lucre", "Condado del Rey", "Punta Pacífica", "Tocumen", "Pacora", "Praderas de San Lorenzo"]) assert.ok(g.includes(lugar), lugar);
  for (const lugar of LUGARES_SERVIENTREGA_PANAMA) assert.ok(g.includes(lugar), lugar);
  for (const lugar of ZONAS_PAGO_ADELANTADO_PANAMA) assert.ok(g.includes(lugar), lugar);
  assert.match(g, /responde «adelantado»/);
  assert.match(g, /homónimos/);
});

test("los mapas de despacho (27 nov 2026): los tres colores son ciudad, lo de afuera es Servientrega y no hay tendencia por tienda", () => {
  const g = geografiaDePanama();
  assert.match(g, /MAPAS DE DESPACHO/);
  for (const color of ["NARANJA", "ROJO", "MORADO"]) assert.ok(g.includes(color), color);
  assert.match(g, /No hay tendencia por tienda/);
  assert.doesNotMatch(g, /TENDENCIA HISTÓRICA|Kenku|Nuvo|Oferfy/);
  assert.match(g, /ORDEN PARA DECIDIR LA ZONA/);
});

test("las 13 dudas que se le hicieron a despacho tienen respuesta y salen en la geografía", () => {
  const g = geografiaDePanama();
  assert.equal(DUDAS_RESUELTAS_PANAMA.length, 13);
  for (const d of DUDAS_RESUELTAS_PANAMA) {
    assert.ok(d.respuesta.length > 10, d.lugar);
    assert.ok(g.includes(d.lugar), d.lugar);
  }
  for (const n of NOMBRES_QUE_CONFUNDEN) assert.ok(g.includes(n), n);
});

test("lo que va por Servientrega no está en las zonas de delivery", () => {
  const delivery = new Set(ZONAS_DELIVERY_PANAMA.flatMap((z) => z.lugares.map(normalizarTexto)));
  for (const lugar of ["Chilibre", "Las Garzas", "Panamá Pacífico", "Cerro Azul", "San Martín de Pacora", "Calzada Larga", "Cocolí"]) assert.ok(!delivery.has(normalizarTexto(lugar)), lugar);
  for (const lugar of ["Praderas de San Lorenzo", "Ernesto Córdoba Campos", "Colinas de Las Cumbres", "Las Mañanitas", "Alcalde Díaz", "Villa Grecia"]) assert.ok(delivery.has(normalizarTexto(lugar)), lugar);
});
