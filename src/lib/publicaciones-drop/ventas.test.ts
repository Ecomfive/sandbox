import assert from "node:assert/strict";
import { test } from "node:test";
import { diaCostaRica, pedidosDeLectura, ventasPorDiaDrop } from "./ventas";

const A = "6ac796c7c2cc5701cb95fecf";
const B = "6ad0ec568b1d3068995a0f91";
const pedido = (id: string, estado: string, despachado: string | null, productos: { id: string; cantidad: number }[], linea: { estado: string; en: string }[] = []) => ({
  id,
  numero: "1794069439199",
  estado,
  creado: "2026-11-07T16:37:19.213Z",
  despachado,
  linea,
  productos: productos.map((p) => ({ ...p, variante: null, nombre: "Kreain Gel" })),
});

test("el día es el de Costa Rica (UTC−6)", () => {
  assert.equal(diaCostaRica("2026-11-08T05:59:00Z"), "2026-11-07");
  assert.equal(diaCostaRica("2026-11-08T06:00:00Z"), "2026-11-08");
});

test("lo despachado sale el día del despacho; cancelados y rechazados no cuentan", () => {
  const p = pedidosDeLectura([
    pedido("6aef53bfd2031b2f1b083d39", "1", "2026-11-07T17:44:46.639Z", [{ id: A, cantidad: 2 }]),
    pedido("6aef53bfd2031b2f1b083d40", "4", "2026-11-07T20:00:00Z", [{ id: A, cantidad: 1 }, { id: B, cantidad: 3 }]),
    pedido("6aef53bfd2031b2f1b083d41", "cancelled", null, [{ id: A, cantidad: 5 }]),
    pedido("6aef53bfd2031b2f1b083d42", "rejected", null, [{ id: B, cantidad: 5 }]),
  ]);
  assert.deepEqual(ventasPorDiaDrop(p), [
    { producto_id: A, dia: "2026-11-07", salidas: 3, devueltas: 0 },
    { producto_id: B, dia: "2026-11-07", salidas: 3, devueltas: 0 },
  ]);
});

test("un «No entregado» vuelve a la bodega el día en que quedó así", () => {
  const p = pedidosDeLectura([
    pedido("6aef53bfd2031b2f1b083d39", "8", "2026-11-01T15:00:00Z", [{ id: A, cantidad: 2 }], [
      { estado: "fulfilled", en: "2026-11-01T15:00:00Z" },
      { estado: "8", en: "2026-11-04T18:00:00Z" },
    ]),
  ]);
  assert.deepEqual(ventasPorDiaDrop(p), [
    { producto_id: A, dia: "2026-11-01", salidas: 2, devueltas: 0 },
    { producto_id: A, dia: "2026-11-04", salidas: 0, devueltas: 2 },
  ]);
});

test("la lectura se revisa: ids, cantidades y fechas raras no pasan; un pedido repetido cuenta una vez", () => {
  const p = pedidosDeLectura([
    pedido("6aef53bfd2031b2f1b083d39", "1", "2026-11-07T17:44:46Z", [{ id: A, cantidad: 1 }, { id: "x", cantidad: 1 }, { id: B, cantidad: 1.5 }, { id: B, cantidad: 0 }]),
    pedido("6aef53bfd2031b2f1b083d39", "1", "2026-11-07T17:44:46Z", [{ id: A, cantidad: 9 }]),
    pedido("no-es-id", "1", "2026-11-07T17:44:46Z", [{ id: A, cantidad: 9 }]),
    { ...pedido("6aef53bfd2031b2f1b083d50", "1", null, [{ id: A, cantidad: 9 }]), despachado: "ayer" },
    null,
    "texto",
  ]);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].productos.map((x) => x.cantidad), [1]);
  assert.equal(p[1].despachado, null);
  assert.deepEqual(ventasPorDiaDrop(p), [{ producto_id: A, dia: "2026-11-07", salidas: 1, devueltas: 0 }]);
});
