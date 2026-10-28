import assert from "node:assert/strict";
import { test } from "node:test";
import { diasPedidoLlegada, promedioDias } from "./tiempo-compra";

test("días del pedido a la llegada, sin corrimiento por la hora del pedido", () => {
  assert.equal(diasPedidoLlegada("2026-04-30T20:54:05.769+00:00", "2026-08-12"), 104);
  assert.equal(diasPedidoLlegada("2025-10-24T15:41:42Z", "2026-01-08"), 76);
  assert.equal(diasPedidoLlegada("2026-04-30", null), null);
  assert.equal(diasPedidoLlegada("2026-05-10", "2026-05-01"), null);
});

test("el promedio solo cuenta las compras que llegaron", () => {
  assert.equal(promedioDias([104, 76, null]), 90);
  assert.equal(promedioDias([null, null]), null);
});
