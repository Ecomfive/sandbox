import { strict as assert } from "node:assert";
import { test } from "node:test";
import { leerMesNota, limpiarNota, MAX_NOTA } from "./notas";

test("la nota se limpia sin tocar el formato simple", () => {
  assert.deepEqual(limpiarNota("## Ventas  \r\n- Subieron\u0007\n\n\n\n1. Revisar"), { texto: "## Ventas\n- Subieron\n\n1. Revisar" });
  assert.deepEqual(limpiarNota("   "), { texto: "" });
  assert.ok("error" in limpiarNota("x".repeat(MAX_NOTA + 1)));
  assert.ok("error" in limpiarNota(3));
});

test("el mes de la nota", () => {
  assert.equal(leerMesNota("2026-10"), "2026-10-01");
  assert.equal(leerMesNota("2026-10-01"), "2026-10-01");
  assert.equal(leerMesNota("2026-13"), null);
  assert.equal(leerMesNota("x"), null);
});
