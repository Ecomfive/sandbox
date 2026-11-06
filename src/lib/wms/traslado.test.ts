import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LINEAS_TRASLADO, numeroTraslado, revisarLineasTraslado } from "./traslado";

const A = "0194f0a2-0000-7000-8000-000000000001";
const B = "0194f0a2-0000-7000-8000-000000000002";

test("el número lleva ceros y crece sin cortarse", () => {
  assert.equal(numeroTraslado(7), "TRA-0007");
  assert.equal(numeroTraslado(12345), "TRA-12345");
});

test("acepta varios productos y convierte la cantidad", () => {
  assert.deepEqual(revisarLineasTraslado([{ sku: A, cantidad: "50" }, { sku: B, cantidad: 3 }]), { lineas: [{ sku: A, cantidad: 50 }, { sku: B, cantidad: 3 }] });
});

test("no acepta un traslado vacío, un producto repetido ni cantidades malas", () => {
  assert.match((revisarLineasTraslado([]) as { error: string }).error, /al menos un producto/);
  assert.match((revisarLineasTraslado([{ sku: A, cantidad: 1 }, { sku: A, cantidad: 2 }]) as { error: string }).error, /dos veces/);
  for (const cantidad of [0, -1, 1.5, "", "abc", 2_000_000]) assert.match((revisarLineasTraslado([{ sku: A, cantidad }]) as { error: string }).error, /cantidad entera/);
  assert.match((revisarLineasTraslado([{ sku: "x", cantidad: 1 }]) as { error: string }).error, /no es válido/);
});

test("tiene un tope de productos", () => {
  const muchas = Array.from({ length: MAX_LINEAS_TRASLADO + 1 }, (_, i) => ({ sku: `0194f0a2-0000-7000-8000-${String(i).padStart(12, "0")}`, cantidad: 1 }));
  assert.match((revisarLineasTraslado(muchas) as { error: string }).error, /demasiados/);
});
