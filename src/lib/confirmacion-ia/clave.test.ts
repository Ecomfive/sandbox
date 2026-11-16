import assert from "node:assert/strict";
import test from "node:test";
import { claveCoincide, huellaDeClave } from "./clave";

test("la contraseña coincide solo con su huella", () => {
  const h = huellaDeClave("ConfIA-2026");
  assert.ok(claveCoincide("ConfIA-2026", h));
  assert.ok(!claveCoincide("confia-2026", h));
  assert.ok(!claveCoincide("", h));
  // La misma contraseña da otra huella cada vez (sal distinta).
  assert.notEqual(huellaDeClave("ConfIA-2026"), h);
});

test("sin huella guardada, o mal formada, nada coincide", () => {
  assert.ok(!claveCoincide("lo que sea", null));
  assert.ok(!claveCoincide("lo que sea", ""));
  assert.ok(!claveCoincide("lo que sea", "sin-formato"));
  assert.ok(!claveCoincide("lo que sea", "zz:zz"));
});
