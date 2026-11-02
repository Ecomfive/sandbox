import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarAtencion, medianaPesada, parteDe, porcentaje, posicionEnMeta } from "./atencion";

describe("armarAtencion", () => {
  it("suma las áreas, ordena los días y convierte lo que llega como texto", () => {
    const a = armarAtencion({
      areas: [
        { area: "atencion", conversaciones: 10, consultas: 8, sin_responder: 2, en_15_min: 3, mediana_min: 10 },
        { area: "comercial", conversaciones: "5" as unknown as number, consultas: 2, sin_responder: 0, en_15_min: 2, mediana_min: 30 },
      ],
      dias: [
        { dia: "2026-11-02", consultas: 4, sin_responder: 1, mediana_min: null },
        { dia: "2026-11-01", consultas: 6, sin_responder: 1, mediana_min: 12 },
      ],
    });
    assert.equal(a.conversaciones, 15);
    assert.equal(a.consultas, 10);
    assert.equal(a.sinResponder, 2);
    assert.equal(a.en15, 5);
    assert.deepEqual(a.dias.map((d) => d.dia), ["2026-11-01", "2026-11-02"]);
    assert.equal(a.dias[1].medianaMin, null);
  });
  it("sin datos queda todo en cero", () => {
    const a = armarAtencion(null);
    assert.equal(a.consultas, 0);
    assert.equal(a.medianaMin, null);
    assert.deepEqual(a.numeros, []);
  });
});

describe("medianaPesada", () => {
  it("pesa la mediana de cada grupo por sus consultas respondidas", () => {
    // 6 respondidas con 10 min y 2 con 30 min → (60 + 60) / 8 = 15.
    const r = medianaPesada([
      { consultas: 8, sinResponder: 2, medianaMin: 10 },
      { consultas: 2, sinResponder: 0, medianaMin: 30 },
    ]);
    assert.equal(r, 15);
  });
  it("ignora lo que nadie respondió o no tiene mediana", () => {
    assert.equal(medianaPesada([{ consultas: 3, sinResponder: 3, medianaMin: 5 }]), null);
    assert.equal(medianaPesada([{ consultas: 3, sinResponder: 0, medianaMin: null }]), null);
  });
});

describe("porcentajes y meta", () => {
  it("el porcentaje y la parte de un total", () => {
    assert.equal(porcentaje(1, 3), "33 %");
    assert.equal(porcentaje(1, 0), "—");
    assert.equal(parteDe(5, 4), 100);
    assert.equal(parteDe(0, 0), 0);
  });
  it("la posición en la barra de la meta llega al borde si se pasa", () => {
    assert.ok(Math.abs((posicionEnMeta(15, 15) ?? 0) - 100 / 3) < 1e-9);
    assert.equal(posicionEnMeta(500, 15), 100);
    assert.equal(posicionEnMeta(null, 15), null);
    assert.equal(posicionEnMeta(10, 0), null);
  });
});
