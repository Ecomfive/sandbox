import { test } from "node:test";
import assert from "node:assert/strict";
import { clavesDistintas, descartadoPara, separarDescartados } from "./descartar";

test("no es el mismo: un competidor descartado para uno de nuestros productos deja de contar", () => {
  const distintas = clavesDistintas([
    { producto_id: "c1", nuestro_id: "n1", veredicto: "distinto" },
    { producto_id: "c2", nuestro_id: "n1", veredicto: "mismo" },
    { producto_id: "c3", nuestro_id: "n2", veredicto: "parecido" },
  ]);
  assert.equal(distintas.size, 1, "solo «distinto» descarta");
  assert.equal(descartadoPara("c1", ["n1"], distintas), true);
  assert.equal(descartadoPara("c1", ["n9", "n1"], distintas), true, "con dos IDs de Dropi, basta uno");
  assert.equal(descartadoPara("c1", ["n2"], distintas), false, "descartado para otro producto nuestro, no para este");
  assert.equal(descartadoPara("c2", ["n1"], distintas), false);
  const { cuentan, descartados } = separarDescartados([{ id: "c2" }, { id: "c1" }, { id: "c3" }], ["n1"], distintas);
  assert.deepEqual(cuentan.map((c) => c.id), ["c2", "c3"]);
  assert.deepEqual(descartados.map((c) => c.id), ["c1"]);
});
