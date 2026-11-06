import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LINEAS_REMISION, numeroRemision, revisarLineasRemision } from "./remision";

const A = "0194f0a2-0000-7000-8000-000000000001";
const B = "0194f0a2-0000-7000-8000-000000000002";

test("el número lleva ceros y crece sin cortarse", () => {
  assert.equal(numeroRemision(12), "REM-0012");
  assert.equal(numeroRemision(12345), "REM-12345");
});

test("acepta varios productos y convierte la cantidad", () => {
  assert.deepEqual(revisarLineasRemision([{ sku: A, cantidad: "200" }, { sku: B, cantidad: 5 }]), { lineas: [{ sku: A, cantidad: 200 }, { sku: B, cantidad: 5 }] });
});

test("no acepta una remisión vacía, ni un producto repetido, ni cantidades malas", () => {
  assert.match((revisarLineasRemision([]) as { error: string }).error, /al menos un producto/);
  assert.match((revisarLineasRemision(null) as { error: string }).error, /al menos un producto/);
  assert.match((revisarLineasRemision([{ sku: A, cantidad: 1 }, { sku: A, cantidad: 2 }]) as { error: string }).error, /dos veces/);
  for (const cantidad of [0, -1, 1.5, "", "abc", 2_000_000]) assert.match((revisarLineasRemision([{ sku: A, cantidad }]) as { error: string }).error, /cantidad entera/);
  assert.match((revisarLineasRemision([{ sku: "x", cantidad: 1 }]) as { error: string }).error, /no es válido/);
});

test("tiene un tope de productos", () => {
  const muchas = Array.from({ length: MAX_LINEAS_REMISION + 1 }, (_, i) => ({ sku: `0194f0a2-0000-7000-8000-${String(i).padStart(12, "0")}`, cantidad: 1 }));
  assert.match((revisarLineasRemision(muchas) as { error: string }).error, /demasiados/);
});
