import assert from "node:assert/strict";
import test from "node:test";
import { interpretarActivo } from "./ajustes";

test("solo un activo:false escrito pausa el análisis automático", () => {
  assert.equal(interpretarActivo({ activo: false }), false);
  assert.equal(interpretarActivo({ activo: true }), true);
  assert.equal(interpretarActivo({}), true);
  assert.equal(interpretarActivo(null), true);
  assert.equal(interpretarActivo(undefined), true);
  assert.equal(interpretarActivo("pausa"), true);
});
