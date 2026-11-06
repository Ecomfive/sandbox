import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAIS_DE_DROP, plataformaDisponible, plataformaValida, plataformasDePais } from "./plataformas";

describe("plataformas", () => {
  it("Drop es solo de Costa Rica; Dropi está en todos los países", () => {
    assert.equal(PAIS_DE_DROP, "CR");
    assert.equal(plataformaDisponible("drop", "CR"), true);
    assert.equal(plataformaDisponible("drop", "PA"), false);
    assert.equal(plataformaDisponible("drop", "MX"), false);
    assert.equal(plataformaDisponible("dropi", "PA"), true);
    assert.equal(plataformaDisponible("dropi", "CR"), true);
  });
  it("qué plataformas hay en cada país", () => {
    assert.deepEqual(plataformasDePais("CR").map((p) => p.id), ["dropi", "drop", "effi"]);
    assert.deepEqual(plataformasDePais("PA").map((p) => p.id), ["dropi"]);
  });
  it("un valor desconocido cae en Dropi", () => {
    assert.equal(plataformaValida("drop"), "drop");
    assert.equal(plataformaValida("otra"), "dropi");
    assert.equal(plataformaValida(undefined), "dropi");
  });
});
