import assert from "node:assert/strict";
import test from "node:test";
import { masBaratoDrop } from "./competencia";

test("bajar precio: el competidor más barato con stock, a precio equivalente", () => {
  const c = {
    nuestroPrecio: 5000,
    nuestroNombre: "Aceite de batana 60ml",
    competidores: [
      { proveedor: "A", nombre: "Aceite de batana 60ml", precio: 4800, stock: 10 },
      { proveedor: "B", nombre: "Aceite de batana 60ml", precio: 4500, stock: 0 },
      { proveedor: "C", nombre: "Aceite de batana 60ml", precio: 5200, stock: 50 },
    ],
  };
  assert.deepEqual(masBaratoDrop(c), { proveedor: "A", precio: 4800 }, "el de B no tiene stock");
  assert.equal(masBaratoDrop({ ...c, competidores: [c.competidores[2]] }), null);
  assert.equal(masBaratoDrop({ ...c, nuestroPrecio: null }), null);
  assert.equal(masBaratoDrop(undefined), null);
});
