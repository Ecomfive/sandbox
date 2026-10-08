import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { incumple, parsearTiempo, prometidoJunto, resumenReal, textoPrometido } from "./rutas-envio";

describe("parsearTiempo", () => {
  it("lee los formatos de ClickUp", () => {
    assert.deepEqual(parsearTiempo("45-55 days"), { min: 45, max: 55 });
    assert.deepEqual(parsearTiempo("about 10 days"), { min: 10, max: 10 });
    assert.deepEqual(parsearTiempo("12-15 work days"), { min: 12, max: 15 });
    assert.deepEqual(parsearTiempo("about 75-80 days"), { min: 75, max: 80 });
  });
  it("sin números no hay tiempo", () => {
    assert.equal(parsearTiempo(""), null);
    assert.equal(parsearTiempo(null), null);
  });
});

describe("textoPrometido", () => {
  it("rango, un solo número o nada", () => {
    assert.equal(textoPrometido(45, 55), "45–55 días");
    assert.equal(textoPrometido(10, 10), "10 días");
    assert.equal(textoPrometido(null, null), "—");
  });
});

describe("resumenReal", () => {
  const envios = [
    { llegada: "2024-03-01", dias: 70 },
    { llegada: "2025-08-01", dias: 60 },
    { llegada: "2025-11-01", dias: 50 },
    { llegada: "2026-05-01", dias: 58 },
    { llegada: "2026-06-01", dias: -2 },
  ];
  const r = resumenReal(envios, "2026-10-08");
  it("toda la vida", () => {
    assert.deepEqual(r.historico, { n: 4, promedio: 60, min: 50, max: 70 });
  });
  it("los últimos 12 meses por la fecha de llegada", () => {
    assert.equal(r.ultimos12.n, 2);
    assert.equal(r.ultimos12.promedio, 54);
  });
  it("el año en curso", () => {
    assert.equal(r.anioActual.n, 1);
    assert.equal(r.anioActual.promedio, 58);
  });
  it("los últimos 2 meses", () => {
    const r2 = resumenReal([{ llegada: "2026-09-01", dias: 40 }, { llegada: "2026-07-01", dias: 90 }], "2026-10-08");
    assert.equal(r2.ultimos2.n, 1);
    assert.equal(r2.ultimos2.promedio, 40);
  });
  it("incumple si lo real pasa del máximo prometido", () => {
    assert.equal(incumple(50, r), true);
    assert.equal(incumple(55, r), false);
    assert.equal(incumple(null, r), false);
  });
});

describe("prometidoJunto", () => {
  it("promedia mínimos y máximos de las rutas que prometen algo", () => {
    assert.deepEqual(prometidoJunto([{ diasMin: 40, diasMax: 50 }, { diasMin: 60, diasMax: 70 }, { diasMin: null, diasMax: null }]), { min: 50, max: 60 });
    assert.equal(prometidoJunto([{ diasMin: null, diasMax: null }]), null);
  });
});
