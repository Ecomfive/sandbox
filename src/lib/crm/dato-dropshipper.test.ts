import { test } from "node:test";
import assert from "node:assert/strict";
import { esCampoDato, normalizarDato } from "./dato-dropshipper";

const HOY = "2026-10-29";

test("vacío es quitar el dato", () => {
  for (const campo of ["ciudad", "ingreso", "correo"] as const) assert.deepEqual(normalizarDato(campo, "   ", HOY), { valor: null });
});

test("ciudad: quita espacios de más y pone un tope", () => {
  assert.deepEqual(normalizarDato("ciudad", "  Ciudad   de Panamá ", HOY), { valor: "Ciudad de Panamá" });
  assert.ok("error" in normalizarDato("ciudad", "a".repeat(81), HOY));
});

test("correo: en minúsculas y con forma de correo", () => {
  assert.deepEqual(normalizarDato("correo", " Josa@Gmail.COM ", HOY), { valor: "josa@gmail.com" });
  assert.ok("error" in normalizarDato("correo", "josa@gmail", HOY));
  assert.ok("error" in normalizarDato("correo", "no es correo", HOY));
});

test("ingreso: fecha real, no futura", () => {
  assert.deepEqual(normalizarDato("ingreso", "2026-05-19", HOY), { valor: "2026-05-19" });
  assert.deepEqual(normalizarDato("ingreso", HOY, HOY), { valor: HOY });
  assert.ok("error" in normalizarDato("ingreso", "2026-10-30", HOY));
  assert.ok("error" in normalizarDato("ingreso", "2026-02-30", HOY));
  assert.ok("error" in normalizarDato("ingreso", "19/05/2026", HOY));
});

test("solo se aceptan los campos editables", () => {
  assert.ok(esCampoDato("ciudad"));
  assert.ok(!esCampoDato("notas"));
  assert.ok(!esCampoDato("toString"));
});
