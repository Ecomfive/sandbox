import assert from "node:assert/strict";
import { test } from "node:test";
import { configCapitalAGuardar, leerConfigCapital, validarConfigCapital } from "./capital-config";

test("leer y guardar los supuestos de Capital y riesgo", () => {
  const c = leerConfigCapital({ wacc: 14, asignacion: { elasticidad: 0.6, piso_pct: 40, dias_inventario: 30 } });
  assert.deepEqual(c, { wacc: 14, asignacion: { elasticidad: 0.6, pisoPct: 40, diasInventario: 30 } });
  assert.deepEqual(leerConfigCapital(configCapitalAGuardar(c)), c);
  assert.equal(leerConfigCapital({ wacc: 500 }).wacc, null);
});

test("validar: WACC vacío vuelve al costo financiero; fuera de rango da error", () => {
  const actual = leerConfigCapital({ wacc: 14 });
  const r = validarConfigCapital((k) => ({ wacc: "" })[k as "wacc"], actual);
  assert.ok("config" in r && r.config.wacc === null);
  assert.ok("error" in validarConfigCapital((k) => ({ elasticidad: "1.5" })[k as "elasticidad"], actual));
  const ok = validarConfigCapital((k) => ({ elasticidad: "0.4", pisoPct: "20" })[k as "elasticidad"], actual);
  assert.ok("config" in ok && ok.config.asignacion.elasticidad === 0.4 && ok.config.asignacion.pisoPct === 20 && ok.config.wacc === 14);
});
