import assert from "node:assert/strict";
import { test } from "node:test";
import { compraCuenta } from "./cuenta";

test("una compra descartada o anulada no suma; las demás etapas sí", () => {
  assert.equal(compraCuenta({ etapa: "descartado" }), false);
  assert.equal(compraCuenta({ etapa: "completado", anulada: "2026-10-01T00:00:00Z" }), false);
  assert.equal(compraCuenta({ etapa: "completado", anulada: null }), true);
  for (const etapa of ["cotizar", "cotizado", "produccion", "tracking", "arribo_mercancia", "completado", "backlog"]) assert.equal(compraCuenta({ etapa }), true, etapa);
});
