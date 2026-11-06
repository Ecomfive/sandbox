import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GESTION_IDS, PAIS_DE_DROP, gestionesDePais, plataformaDisponible, plataformaValida, plataformasDePais, tieneCompetencia } from "./plataformas";

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
  it("Effi es solo de Costa Rica y no tiene análisis de competencia", () => {
    assert.equal(plataformaDisponible("effi", "CR"), true);
    assert.equal(plataformaDisponible("effi", "PA"), false);
    assert.equal(tieneCompetencia("effi"), false);
    assert.equal(tieneCompetencia("drop"), true);
    assert.equal(plataformaValida("effi"), "effi");
  });
  it("Gestión de IDs: las tres rutas y quién puede abrir cuáles", () => {
    assert.equal(GESTION_IDS.effi.ruta, "/publicaciones-effi");
    assert.deepEqual(gestionesDePais("CR", null).map((p) => p.id), ["dropi", "drop", "effi"]);
    assert.deepEqual(gestionesDePais("CR", ["publicaciones-dropi", "publicaciones-effi"]).map((p) => p.id), ["dropi", "effi"]);
    assert.deepEqual(gestionesDePais("PA", null).map((p) => p.id), ["dropi"]);
    assert.deepEqual(gestionesDePais("CR", ["producto"]).map((p) => p.id), []);
  });
});
