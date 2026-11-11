import assert from "node:assert/strict";
import { test } from "node:test";
import { esFranja, etiquetaFranja, limpiarEtiquetasOrden } from "./operacion";

test("limpia etiquetas", () => {
  assert.deepEqual(limpiarEtiquetasOrden(" Regalo, regalo ,  frágil,, VIP "), ["Regalo", "frágil", "VIP"]);
  assert.equal(limpiarEtiquetasOrden(Array(20).fill(0).map((_, i) => `e${i}`)).length, 8);
  assert.deepEqual(limpiarEtiquetasOrden(null), []);
});
test("franjas", () => {
  assert.equal(esFranja("tarde"), true);
  assert.equal(esFranja("madrugada"), false);
  assert.equal(etiquetaFranja(null), "Cualquier hora");
});
