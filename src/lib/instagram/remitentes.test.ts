import assert from "node:assert/strict";
import test from "node:test";
import { esDelEquipo, remitentesPermitidos } from "./remitentes";

test("remitentes: solo el equipo y los IDs válidos de INSTAGRAM_REMITENTES", () => {
  const p = remitentesPermitidos("123456789, abc, 987654321 ,, ../x");
  assert.equal(esDelEquipo("1830660511438138", p), true);
  assert.equal(esDelEquipo("123456789", p), true);
  assert.equal(esDelEquipo("987654321", p), true);
  assert.equal(esDelEquipo("abc", p), false);
  assert.equal(esDelEquipo("999", p), false);
  assert.equal(esDelEquipo("555555555", remitentesPermitidos(undefined)), false);
});
