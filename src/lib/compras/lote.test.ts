import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cierreAlCambiarEtapa, combinarLista, MAX_COMPRAS_LOTE, presenciaEnLote } from "./lote";

describe("combinarLista", () => {
  it("poner deja la misma lista, sin repetidos", () => {
    assert.deepEqual(combinarLista(["a"], "poner", ["x", "y", "x"]), ["x", "y"]);
  });

  it("agregar suma las que faltan y respeta las que ya tenía, en su orden", () => {
    assert.deepEqual(combinarLista(["reposición", "kenku"], "agregar", ["Envío 1"]), ["reposición", "kenku", "Envío 1"]);
  });

  it("agregar no repite una etiqueta que solo cambia en mayúsculas o acentos", () => {
    assert.deepEqual(combinarLista(["Envío 1"], "agregar", ["envio 1", "Envío 2"]), ["Envío 1", "Envío 2"]);
  });

  it("quitar saca solo las pedidas y deja el resto", () => {
    assert.deepEqual(combinarLista(["a", "B", "c"], "quitar", ["b"]), ["a", "c"]);
    assert.deepEqual(combinarLista([], "quitar", ["a"]), []);
  });

  it("no pasa del máximo de etiquetas", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => `e${i}`);
    assert.equal(combinarLista([], "agregar", muchas).length, 30);
  });
});

describe("presenciaEnLote", () => {
  const listas = [["a", "b"], ["a"], []];
  it("dice si la tienen todas, algunas o ninguna", () => {
    assert.equal(presenciaEnLote(listas, "a"), "algunas");
    assert.equal(presenciaEnLote(listas, "z"), "ninguna");
    assert.equal(presenciaEnLote([["a"], ["A"]], "a"), "todas");
  });
});

describe("cierreAlCambiarEtapa", () => {
  it("sella al cerrar una compra abierta", () => {
    assert.equal(cierreAlCambiarEtapa("produccion", "completado"), "sellar");
    assert.equal(cierreAlCambiarEtapa("tracking", "descartado"), "sellar");
  });
  it("mantiene la fecha si ya estaba cerrada", () => {
    assert.equal(cierreAlCambiarEtapa("completado", "descartado"), "mantener");
  });
  it("la quita al reabrir o al moverse entre etapas abiertas", () => {
    assert.equal(cierreAlCambiarEtapa("completado", "tracking"), "quitar");
    assert.equal(cierreAlCambiarEtapa("cotizar", "cotizado"), "quitar");
  });
});

describe("límite", () => {
  it("una página entera de la lista cabe", () => {
    assert.ok(MAX_COMPRAS_LOTE >= 100);
  });
});
