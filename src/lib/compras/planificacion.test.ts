import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimarPlanificacion, mesPlanificacion, nuevaPlanificacion, tiemposDeTransito } from "./planificacion";

const historial = [
  ...[50, 59, 70].map((dias) => ({ clave: "PA", via: "mar", dias })),
  ...[80, 85, 90, 95].map((dias) => ({ clave: "CR", via: "mar", dias })),
  { clave: "PA", via: "aire", dias: 16 },
  { clave: "CR", via: "aire", dias: 20 },
  { clave: "MX", via: "aire", dias: 30 },
  { clave: "PA", via: "mar", dias: -3 }, // fecha mal puesta: no cuenta
];
const tiempos = tiemposDeTransito(historial);

describe("mesPlanificacion", () => {
  it("usa el formato de ClickUp", () => {
    assert.equal(mesPlanificacion("2026-11-03"), "Nov26");
    assert.equal(mesPlanificacion("2027-01-31"), "Ene27");
  });
});

describe("estimarPlanificacion", () => {
  it("suma a la fecha de envío la mediana de su país por esa vía", () => {
    const e = estimarPlanificacion(tiempos, "PA", ["mar"], "2026-09-10")!;
    assert.equal(e.dias, 59);
    assert.equal(e.base, "pais");
    assert.equal(e.llegadaEstimada, "2026-11-08");
    assert.equal(e.planificacion, "Nov26");
  });

  it("cada país tiene su tiempo", () => {
    assert.equal(estimarPlanificacion(tiempos, "CR", ["mar"], "2026-09-10")!.dias, 88);
  });

  it("con pocos envíos del país usa los de todos los países por esa vía", () => {
    const e = estimarPlanificacion(tiempos, "PA", ["aire"], "2026-09-10")!;
    assert.equal(e.base, "todos");
    assert.equal(e.dias, 20);
  });

  it("sin envíos para medir usa lo típico de la vía", () => {
    const e = estimarPlanificacion(tiempos, "PA", ["tierra"], "2026-09-10")!;
    assert.equal(e.base, "defecto");
    assert.equal(e.dias, 7);
  });

  it("con varias vías planifica con la más lenta", () => {
    assert.equal(estimarPlanificacion(tiempos, "PA", ["aire", "mar"], "2026-09-10")!.via, "mar");
  });

  it("sin fecha de envío no hay planificación", () => {
    assert.equal(estimarPlanificacion(tiempos, "PA", ["mar"], null), null);
  });
});

describe("nuevaPlanificacion", () => {
  it("con fecha de envío, la calculada", () => {
    assert.equal(nuevaPlanificacion(tiempos, { fechaEnvio: null, planificacion: "Ene26" }, { clave: "PA", vias: ["mar"], fechaEnvio: "2026-09-10" }), "Nov26");
  });
  it("si nunca tuvo fecha de envío, conserva la que tenía", () => {
    assert.equal(nuevaPlanificacion(tiempos, { fechaEnvio: null, planificacion: "Ene26" }, { clave: "PA", vias: ["mar"], fechaEnvio: null }), "Ene26");
  });
  it("si se le quitó la fecha de envío, ninguna", () => {
    assert.equal(nuevaPlanificacion(tiempos, { fechaEnvio: "2026-09-10", planificacion: "Nov26" }, { clave: "PA", vias: ["mar"], fechaEnvio: null }), null);
  });
  it("una compra nueva sin fecha de envío, ninguna", () => {
    assert.equal(nuevaPlanificacion(tiempos, null, { clave: "PA", vias: ["mar"], fechaEnvio: null }), null);
  });
});
