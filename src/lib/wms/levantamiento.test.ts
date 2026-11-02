import { test } from "node:test";
import assert from "node:assert/strict";
import { revisarConteo } from "./levantamiento";

const A = "0194f0a2-0000-7000-8000-000000000001";
const B = "0194f0a2-0000-7000-8000-000000000002";

test("acepta productos simples y con lotes", () => {
  const r = revisarConteo([{ sku: A, cantidad: "147" }, { sku: B, lotes: [{ codigo: "  L1 ", vencimiento: "2030-01-01", cantidad: 10 }, { codigo: "L2", vencimiento: null, cantidad: 0 }] }]);
  assert.deepEqual(r, { items: [{ sku: A, cantidad: 147 }, { sku: B, lotes: [{ codigo: "L1", vencimiento: "2030-01-01", cantidad: 10 }, { codigo: "L2", vencimiento: null, cantidad: 0 }] }] });
});

test("cero es una cantidad válida (se contó y no había)", () => {
  assert.deepEqual(revisarConteo([{ sku: A, cantidad: 0 }]), { items: [{ sku: A, cantidad: 0 }] });
});

test("rechaza lo que no sirve", () => {
  assert.ok("error" in revisarConteo([]));
  assert.ok("error" in revisarConteo([{ sku: "x", cantidad: 1 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: -1 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: 1.5 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: "" }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: 1 }, { sku: A, cantidad: 2 }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "", cantidad: 1 }] }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "L1", cantidad: 1 }, { codigo: "l1", cantidad: 2 }] }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "L1", vencimiento: "31/12/2030", cantidad: 1 }] }]));
});

import { leerLista } from "./levantamiento";

test("lee una lista con punto y coma, tabulador o coma, y salta el encabezado", () => {
  const r = leerLista("﻿Producto;Oficina\nAceite de Batana;850\nBolsas de rollo 17*30;29,900\nLemme Burn\t3.208\nKing Maker,201\nSin cantidad;\n\n");
  assert.deepEqual(r.lineas, [
    { nombre: "Aceite de Batana", cantidad: 850 },
    { nombre: "Bolsas de rollo 17*30", cantidad: 29900 },
    { nombre: "Lemme Burn", cantidad: 3208 },
    { nombre: "King Maker", cantidad: 201 },
  ]);
  assert.equal(r.saltadas, 2);
});

test("una cantidad que no es un número entero se salta", () => {
  assert.deepEqual(leerLista("A;-3\nB;1.5\nC;abc").lineas, []);
});
