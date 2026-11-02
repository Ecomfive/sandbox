import assert from "node:assert/strict";
import { test } from "node:test";
import { errorContrasenaNueva, tieneContrasenaTemporal } from "./contrasena";

test("la contraseña nueva: actual, largo, espacios, que coincida y que sea otra", () => {
  assert.equal(errorContrasenaNueva("", "nueva-clave-1", "nueva-clave-1"), "Escribe tu contraseña actual.");
  assert.match(errorContrasenaNueva("vieja", "corta", "corta") ?? "", /al menos 8/);
  assert.match(errorContrasenaNueva("vieja", "x".repeat(73), "x".repeat(73)) ?? "", /muy larga/);
  assert.match(errorContrasenaNueva("vieja", "ñ".repeat(40), "ñ".repeat(40)) ?? "", /muy larga/, "se cuentan bytes, no letras");
  assert.match(errorContrasenaNueva("vieja", " espacio-al-inicio", " espacio-al-inicio") ?? "", /espacio/);
  assert.match(errorContrasenaNueva("vieja", "nueva-clave-1", "nueva-clave-2") ?? "", /no coinciden/);
  assert.match(errorContrasenaNueva("misma-clave-1", "misma-clave-1", "misma-clave-1") ?? "", /distinta/);
  assert.equal(errorContrasenaNueva("vieja", "Una clave buena 2026", "Una clave buena 2026"), null);
});

test("contraseña temporal: solo con la marca en true", () => {
  assert.equal(tieneContrasenaTemporal({ app_metadata: { clave_temporal: true } }), true);
  assert.equal(tieneContrasenaTemporal({ app_metadata: { clave_temporal: false } }), false);
  assert.equal(tieneContrasenaTemporal({ app_metadata: {} }), false);
  assert.equal(tieneContrasenaTemporal(null), false);
});
