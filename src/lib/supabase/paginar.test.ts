import assert from "node:assert/strict";
import { test } from "node:test";
import { traerTodasLasFilas } from "./paginar";

/** Una tabla falsa de `total` filas que responde como `.range()` y anota qué rangos se pidieron. */
function tabla(total: number) {
  const pedidos: number[] = [];
  const consulta = async (desde: number, hasta: number) => {
    pedidos.push(desde);
    const data = Array.from({ length: Math.max(0, Math.min(hasta, total - 1) - desde + 1) }, (_, i) => desde + i);
    return { data, error: null };
  };
  return { consulta, pedidos };
}

test("trae todas las filas, en orden y sin repetir", async () => {
  for (const total of [0, 5, 999, 1000, 1001, 4000, 11615]) {
    const t = tabla(total);
    const filas = await traerTodasLasFilas(t.consulta);
    assert.equal(filas.length, total, `total ${total}`);
    assert.deepEqual(filas, Array.from({ length: total }, (_, i) => i));
  }
});

test("una tabla chica es un solo pedido", async () => {
  const t = tabla(300);
  await traerTodasLasFilas(t.consulta);
  assert.deepEqual(t.pedidos, [0]);
});

test("un error se lanza", async () => {
  await assert.rejects(traerTodasLasFilas(async () => ({ data: null, error: new Error("sin tabla") })));
});
