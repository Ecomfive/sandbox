import assert from "node:assert/strict";
import { test } from "node:test";
import { diaCostaRica, pedidosDeLectura, productosDeLectura, vendedoresDePedidos, ventasPorDiaDunamixfy } from "./lectura";

const inv = (o: Record<string, unknown>) => ({ stock: 0, reserved: 0, price: 5499, suggestedPrice: 18000, isActive: true, deletedAt: null, privateUserId: null, warehouse: { isPrincipal: true }, ...o });

test("un producto suma solo sus inventarios activos y toma el precio del principal", () => {
  const [p] = productosDeLectura([
    {
      id: "cmtvqku83007k3dnu3zh4w2w3",
      productNumberId: 837,
      name: " ACEITE TRULY ",
      sku: "EFV02",
      images: ["javascript:alert(1)", "https://cdn.dunamixfy.com/a.webp"],
      inventories: [inv({ stock: 3, price: 5889 }), inv({ stock: 200, price: 5499, isActive: false }), inv({ stock: 7, deletedAt: "2026-11-01T00:00:00Z" })],
    },
  ]);
  assert.equal(p.dunamixfyId, "837");
  assert.equal(p.nombre, "ACEITE TRULY");
  assert.equal(p.stock, 3);
  assert.equal(p.precio, 5889);
  assert.equal(p.fotoUrl, "https://cdn.dunamixfy.com/a.webp");
});

test("se descartan productos sin número o repetidos", () => {
  const r = productosDeLectura([{ productNumberId: "x", name: "A" }, { productNumberId: 5, name: "B", inventories: [] }, { productNumberId: 5, name: "C" }, null]);
  assert.deepEqual(
    r.map((p) => [p.dunamixfyId, p.nombre, p.stock, p.precio]),
    [["5", "B", 0, null]],
  );
});

const pedido = (o: Record<string, unknown>) => ({ id: "cmw9n358r0ykm3dqma2l7jc4g", numero: 1, envio: "ENTREGADO", creado: "2026-11-01T15:00:00.000Z", despachado: "2026-11-02T03:00:00.000Z", vendedor: { id: "cmtt4bk5e00vu3do0izzqcwl9", nombre: "Tienda", tienda: "T" }, productos: [{ id: "837", nombre: "Truly", cantidad: 2 }], ...o });

test("salidas el día del despacho en Costa Rica y devueltas el día de la devolución", () => {
  const pedidos = pedidosDeLectura([
    pedido({}),
    pedido({ id: "cmw9makgt0ya73dqmhttzfgbm", envio: "DEVOLUCION", devuelto: "2026-11-05T20:00:00.000Z" }),
    pedido({ id: "cmw9m0lnh0y7u3dqmsl0xoauo", envio: "CANCELADO" }),
    pedido({ id: "cmw9m0lnh0y7u3dqmsl0xoaux", despachado: null }),
  ]);
  assert.equal(diaCostaRica("2026-11-02T03:00:00.000Z"), "2026-11-01");
  assert.deepEqual(ventasPorDiaDunamixfy(pedidos), [
    { producto_id: "837", dia: "2026-11-01", salidas: 4, devueltas: 0 },
    { producto_id: "837", dia: "2026-11-05", salidas: 0, devueltas: 2 },
  ]);
});

test("los vendedores cuentan sus pedidos, entregados y devueltos (sin los cancelados)", () => {
  const [v] = vendedoresDePedidos(
    pedidosDeLectura([pedido({}), pedido({ id: "cmw9makgt0ya73dqmhttzfgbm", envio: "DEVOLUCION", creado: "2026-11-03T00:00:00.000Z" }), pedido({ id: "cmw9m0lnh0y7u3dqmsl0xoauo", envio: "ANULADO" })]),
  );
  assert.equal(v.pedidos, 2);
  assert.equal(v.entregados, 1);
  assert.equal(v.devueltos, 1);
  assert.equal(v.ultimoPedido, "2026-11-03T00:00:00.000Z");
});

test("un pedido con datos raros no se toma", () => {
  assert.equal(pedidosDeLectura([{ id: "../x", productos: [] }, { id: "cmw9n358r0ykm3dqma2l7jc4g", productos: [{ id: "837", cantidad: 5000 }] }])[0].productos.length, 0);
});
