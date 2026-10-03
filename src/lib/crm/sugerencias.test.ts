import assert from "node:assert/strict";
import { test } from "node:test";
import { PUNTAJE_ALTO, normalizarNombre, parecido, sugerirDropshippers } from "./sugerencias";

// Se corre con: npm run test:seguridad (incluye estas pruebas del CRM)
// Los nombres son inventados.

test("quita tildes, signos y las palabras que no distinguen una tienda de otra", () => {
  assert.deepEqual(normalizarNombre("  Tienda  Aurora (PA) "), ["aurora"]);
  assert.deepEqual(normalizarNombre("Café-Express Shop"), ["cafe", "express"]);
  assert.deepEqual(normalizarNombre(null), []);
});

test("la misma tienda con otra palabra común es la misma", () => {
  assert.equal(parecido("Aurora Shop", "Tienda Aurora"), 1);
  assert.equal(parecido("AURORA store", "aurora"), 1);
});

test("un nombre dentro del otro puntúa alto", () => {
  assert.ok(parecido("Novalispty", "Novalis") >= PUNTAJE_ALTO);
  assert.ok(parecido("Diana vende", "Diana Lopez") >= 0.4);
});

test("tiendas distintas puntúan bajo", () => {
  assert.ok(parecido("Nuba shop", "Panamex store") < 0.3);
  assert.equal(parecido("", "Aurora"), 0);
  assert.equal(parecido("Shop", "Store"), 0);
});

test("sugiere primero al dropshipper que más se parece y descarta los que no", () => {
  const lista = [
    { id: "a", nombre: "Marta Ruiz", tienda: "Aurora Shop" },
    { id: "b", nombre: "Pedro Gil", tienda: "Panamex store" },
    { id: "c", nombre: "Aurora Gómez", tienda: null },
  ];
  const r = sugerirDropshippers("Tienda Aurora", lista);
  assert.equal(r[0].dropshipperId, "a");
  assert.ok(r.some((c) => c.dropshipperId === "c"), "también por su nombre");
  assert.ok(!r.some((c) => c.dropshipperId === "b"));
});

test("sin nombre de tienda no hay sugerencias", () => {
  assert.deepEqual(sugerirDropshippers(null, [{ id: "a", nombre: "X", tienda: "Y" }]), []);
});
