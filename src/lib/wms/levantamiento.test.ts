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
