import assert from "node:assert/strict";
import { test } from "node:test";
import { cubetaLlegada, mesDePlanificacion, mesesSiguientes } from "./llegadas";

test("planificación a mes", () => {
  assert.equal(mesDePlanificacion("Nov26"), "2026-11");
  assert.equal(mesDePlanificacion("ene27"), "2027-01");
  assert.equal(mesDePlanificacion("Noviembre"), null);
  assert.equal(mesDePlanificacion(null), null);
});

test("el mes en curso y tres más, cruzando el año", () => {
  assert.deepEqual(mesesSiguientes("2026-10-18"), ["2026-10", "2026-11", "2026-12", "2027-01"]);
});

test("cada compra a su columna", () => {
  const meses = mesesSiguientes("2026-10-18");
  const c = (planificacion: string | null, extra = {}) => ({ etapa: "tracking", fechaLlegada: null, planificacion, ...extra });
  assert.equal(cubetaLlegada(c("Dic26"), meses), "2026-12");
  assert.equal(cubetaLlegada(c("Ene27"), meses), "2027-01");
  assert.equal(cubetaLlegada(c("Sep26"), meses), "antes");
  assert.equal(cubetaLlegada(c("Feb27"), meses), "despues");
  assert.equal(cubetaLlegada(c(null), meses), "sin");
  assert.equal(cubetaLlegada(c("Nov26", { fechaLlegada: "2026-10-01" }), meses), null);
  assert.equal(cubetaLlegada(c("Nov26", { etapa: "completado" }), meses), null);
  assert.equal(cubetaLlegada(c("Nov26", { anulada: { en: "x" } }), meses), null);
});
