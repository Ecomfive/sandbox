import { test } from "node:test";
import assert from "node:assert/strict";
import { textoParaBuscarMonto } from "./buscar-monto";

test("buscar por monto: se encuentra como se teclee", () => {
  const t = textoParaBuscarMonto(-1500.25);
  for (const forma of ["1500.25", "1500,25", "1,500.25", "1.500,25", "1500"]) assert.ok(t.split(" ").includes(forma), forma);
  assert.ok(!t.includes("-"));
  assert.equal(textoParaBuscarMonto(150), "150.00 150,00 150");
  assert.equal(textoParaBuscarMonto(Number.NaN), "");
});
