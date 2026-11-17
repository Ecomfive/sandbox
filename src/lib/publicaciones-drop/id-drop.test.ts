import assert from "node:assert/strict";
import test from "node:test";
import { normalizarIdDrop } from "./id-drop";

test("acepta el ID con o sin el prefijo, en cualquier mayúscula", () => {
  for (const t of ["ID-BRIAH", "id-briah", "  ID-BRIAH ", "ID BRIAH", "BRIAH", "briah"]) assert.deepEqual(normalizarIdDrop(t), { id: "ID-BRIAH" }, t);
  assert.deepEqual(normalizarIdDrop("ID-G72ZM"), { id: "ID-G72ZM" });
  assert.deepEqual(normalizarIdDrop("nfhes"), { id: "ID-NFHES" });
});

test("vacío quita el ID", () => {
  assert.deepEqual(normalizarIdDrop(""), { id: null });
  assert.deepEqual(normalizarIdDrop("   "), { id: null });
  assert.deepEqual(normalizarIdDrop(null), { id: null });
});

test("lo que no tiene la forma de un ID de Drop se rechaza", () => {
  for (const t of ["ID-", "ID-AB", "ID-ABCDEFGHIJKLM", "ID-AB#CD", "https://app.soydrop.com/x", "ID-AB CD-EF"]) assert.ok("error" in normalizarIdDrop(t), t);
});
