import assert from "node:assert/strict";
import test from "node:test";
import { estadoSecretoPropio, LARGO_MINIMO_SECRETO, secretoPropio } from "./secretos-propios";

// Secretos propios en vez de derivados de la clave de servicio (auditoría de seguridad, 18 nov 2026).
test("un secreto propio: 32 caracteres o más, sin espacios al borde", () => {
  const largo = "a".repeat(LARGO_MINIMO_SECRETO);
  assert.equal(secretoPropio(largo), largo);
  assert.equal(secretoPropio(`  ${largo}\n`), largo);
  assert.equal(secretoPropio("a".repeat(LARGO_MINIMO_SECRETO - 1)), null);
  assert.equal(secretoPropio(`  ${"a".repeat(LARGO_MINIMO_SECRETO - 1)}  `), null);
  assert.equal(secretoPropio(""), null);
  assert.equal(secretoPropio(undefined), null);
});

test("estado: propio, corto o falta", () => {
  assert.equal(estadoSecretoPropio("x".repeat(64)), "propio");
  assert.equal(estadoSecretoPropio("corto"), "corto");
  assert.equal(estadoSecretoPropio("   "), "falta");
  assert.equal(estadoSecretoPropio(undefined), "falta");
});
