import assert from "node:assert/strict";
import test from "node:test";
import { estadoStock, loQueVende, productosDeCartera, recomendados, type StockProducto, type VentaProducto } from "./productos";

test("estado del stock", () => {
  assert.equal(estadoStock(undefined), "sin_dato");
  assert.equal(estadoStock({ stock: 0, porDia: 3, diasInventario: 0 }), "agotado");
  assert.equal(estadoStock({ stock: 0, porDia: 0, diasInventario: null }), "ok");
  assert.equal(estadoStock({ stock: 20, porDia: 4, diasInventario: 5 }), "se_acaba");
  assert.equal(estadoStock({ stock: 50, porDia: 4, diasInventario: 12 }), "reponer");
  assert.equal(estadoStock({ stock: 500, porDia: 4, diasInventario: 125 }), "ok");
});

const ventas: VentaProducto[] = [
  { dropshipperId: "a", productoId: 1, producto: "Faja", pedidos: 60 },
  { dropshipperId: "a", productoId: 2, producto: "Cepillo", pedidos: 40 },
  { dropshipperId: "b", productoId: 1, producto: "Faja", pedidos: 10 },
  { dropshipperId: "b", productoId: 3, producto: "Lámpara", pedidos: 30 },
  { dropshipperId: "c", productoId: 1, producto: "Faja", pedidos: 5 },
  { dropshipperId: "c", productoId: 3, producto: "Lámpara", pedidos: 8 },
  { dropshipperId: "d", productoId: 4, producto: "Organizador", pedidos: 90 },
  { dropshipperId: "e", productoId: 4, producto: "Organizador", pedidos: 20 },
];
const stock = new Map<number, StockProducto>([
  [1, { stock: 10, porDia: 3, diasInventario: 3 }],
  [2, { stock: 400, porDia: 1.3, diasInventario: 300 }],
  [3, { stock: 300, porDia: 1.3, diasInventario: 230 }],
  [4, { stock: 900, porDia: 4, diasInventario: 225 }],
]);

test("productos de la cartera: primero los que se acaban, con quién los vende", () => {
  const p = productosDeCartera(ventas, stock, new Map([[1, { unidades: 500, llegada: "2026-11-12" }]]));
  assert.equal(p[0].nombre, "Faja");
  assert.equal(p[0].estado, "se_acaba");
  assert.equal(p[0].dropshippers, 3);
  assert.equal(p[0].pedidos, 75);
  assert.deepEqual(p[0].clientes.map((c) => c.dropshipperId), ["a", "b", "c"]);
  assert.equal(p[0].camino?.unidades, 500);
  assert.equal(p[1].nombre, "Organizador");
});

test("lo que vende cada dropshipper, con su parte", () => {
  const l = loQueVende("a", productosDeCartera(ventas, stock, new Map()));
  assert.deepEqual(l.map((x) => [x.nombre, x.parte]), [
    ["Faja", 0.6],
    ["Cepillo", 0.4],
  ]);
  assert.equal(l[0].estado, "se_acaba");
});

test("recomienda lo que venden los parecidos, con stock y que él no vende", () => {
  const p = productosDeCartera(ventas, stock, new Map());
  const r = recomendados("a", p);
  // b y c venden Faja como «a» y también Lámpara: va primero; Organizador lo venden 2 que no se parecen.
  assert.deepEqual(r.map((x) => x.nombre), ["Lámpara", "Organizador"]);
  assert.match(r[0].razon, /2 dropshippers que venden lo mismo/);
  // Nunca un producto que se está acabando ni uno que ya vende.
  assert.ok(!recomendados("d", p).some((x) => x.nombre === "Faja" || x.nombre === "Organizador"));
});
