import assert from "node:assert/strict";
import test from "node:test";
import { enmascararCliente, enmascararNombre, enmascararTelefono } from "./cliente";

test("los datos de la persona salen enmascarados: nunca completos fuera de «Mostrar datos»", () => {
  assert.equal(enmascararNombre("Persona Inventada"), "P****** I******");
  assert.equal(enmascararNombre("A"), "*");
  assert.equal(enmascararNombre(null), "");
  assert.equal(enmascararTelefono("60001234"), "******34");
  assert.equal(enmascararTelefono("+507 6000-1234"), "*********34");
  assert.equal(enmascararTelefono("123"), "***");
  assert.equal(enmascararTelefono(""), "");
  const c = enmascararCliente({ nombre: "Persona Inventada", telefono: "60001234", direccion: "Calle Falsa 123, casa azul", corregimiento: "Zona Inventada", notas: "llamar al 60001234" });
  assert.equal(c.direccion, "••••••");
  assert.equal(c.notas, "••••••");
  assert.equal(c.corregimiento, "Zona Inventada");
  for (const v of Object.values(c)) assert.ok(!v.includes("1234") && !v.includes("Inventada ") && !v.includes("Calle"));
});
