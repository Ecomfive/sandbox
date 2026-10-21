import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detalleEstado, ESCALA_BARRA, estadoRuta, geometriaBarra, realQueManda } from "./estado-ruta";
import { resumenReal } from "./rutas-envio";

describe("estadoRuta", () => {
  it("se pasa del plazo máximo: tarde, con los días de más", () => {
    assert.deepEqual(estadoRuta(55, 62), { estado: "tarde", delta: 7 });
    assert.deepEqual(estadoRuta(10, 21), { estado: "tarde", delta: 11 });
  });
  it("dentro del plazo: ok, con el margen (negativo) o justo en el límite", () => {
    assert.deepEqual(estadoRuta(60, 57), { estado: "ok", delta: -3 });
    assert.deepEqual(estadoRuta(60, 60), { estado: "ok", delta: 0 });
  });
  it("sin envíos medidos o sin plazo prometido no se juzga", () => {
    assert.deepEqual(estadoRuta(45, null), { estado: "sin_medir", delta: null });
    assert.deepEqual(estadoRuta(null, 86), { estado: "sin_plazo", delta: null });
    assert.deepEqual(estadoRuta(null, null), { estado: "sin_plazo", delta: null });
  });
});

describe("detalleEstado", () => {
  it("dice lo que importa de cada estado", () => {
    assert.equal(detalleEstado("tarde", 7), "+7 d sobre el plazo");
    assert.equal(detalleEstado("ok", -3), "3 d de margen");
    assert.equal(detalleEstado("ok", 0), "En el límite del plazo");
    assert.equal(detalleEstado("sin_medir", null), "Aún sin envíos");
    assert.equal(detalleEstado("sin_plazo", null), "Definir el plazo");
  });
});

describe("geometriaBarra", () => {
  const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  it("la línea del máximo cae siempre en el mismo lugar, sin importar el plazo", () => {
    cerca(geometriaBarra(10, 10, 21).limite, 100 / ESCALA_BARRA);
    cerca(geometriaBarra(45, 55, 62).limite, 100 / ESCALA_BARRA);
  });
  it("dentro del plazo no hay exceso", () => {
    const g = geometriaBarra(60, 60, 57);
    cerca(g.excesoAncho, 0);
    cerca(g.dentro, (57 / (60 * ESCALA_BARRA)) * 100);
  });
  it("pasado del plazo: lo de dentro llega al máximo y el resto es exceso", () => {
    const g = geometriaBarra(45, 55, 62);
    cerca(g.dentro, g.limite);
    cerca(g.excesoIzq, g.limite);
    cerca(g.excesoAncho, (7 / (55 * ESCALA_BARRA)) * 100);
  });
  it("sin lo real solo queda la franja del plazo; con un rango la franja tiene ancho", () => {
    const g = geometriaBarra(45, 55, null);
    cerca(g.dentro, 0);
    cerca(g.excesoAncho, 0);
    cerca(g.zonaAncho, (10 / (55 * ESCALA_BARRA)) * 100);
  });
  it("lo real nunca se sale de la barra", () => {
    const g = geometriaBarra(10, 10, 500);
    assert.ok(g.excesoIzq + g.excesoAncho <= 100 + 1e-9);
  });
});

describe("realQueManda", () => {
  it("usa los últimos 12 meses y, si no hay, el histórico", () => {
    const hoy = "2026-10-21";
    const con = resumenReal([{ llegada: "2026-09-01", dias: 60 }, { llegada: "2024-01-01", dias: 90 }], hoy);
    assert.equal(realQueManda(con).promedio, 60);
    const solo = resumenReal([{ llegada: "2024-01-01", dias: 90 }], hoy);
    assert.equal(realQueManda(solo).promedio, 90);
  });
});
