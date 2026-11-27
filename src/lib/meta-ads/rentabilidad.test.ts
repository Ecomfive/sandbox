import { test } from "node:test";
import assert from "node:assert/strict";
import { economiaDe, rentabilidadDe, unidadesPorNombre, type PedidoEconomia } from "./rentabilidad";
import { costoPorVenta } from "./costos-operacion";

const C = { envio: 6.27, cod: 0, operativo: 2.25 };

test("un 2x1 o un pack cuenta las unidades del producto suelto", () => {
  assert.equal(unidadesPorNombre("🔥Super PROMO 2x1 Shampoo Anticaspa"), 2);
  assert.equal(unidadesPorNombre("Base Corrector Zephoco™ ¡PROMOCIÓN 2X1! - Piel Oscura"), 2);
  assert.equal(unidadesPorNombre("PerfectX™ Terapia Articular | 🔥Compra 1 y lleva 1 GRATIS🔥"), 2);
  assert.equal(unidadesPorNombre("Seapuri | Serum 🔥¡Compra 1 y lleva 2!🔥"), 2);
  assert.equal(unidadesPorNombre("Crema Perfectx Terapia Articular 30g PACK-2"), 2);
  assert.equal(unidadesPorNombre("Shampoo Hoegoa PACK 3"), 3);
  assert.equal(unidadesPorNombre("Magnesio Complex 8en1"), 1);
  assert.equal(unidadesPorNombre("Proteína 240 cápsulas"), 1);
  assert.equal(unidadesPorNombre("Gafas +1.50"), 1);
});

test("la venta y el costo por pedido, en promedio", () => {
  const p = (venta: number, unidades: number, costo: number | null, fuente: PedidoEconomia["fuente"] = "compras_pais"): PedidoEconomia => ({ venta, unidades, costo, fuente, costoUnitario: costo === null ? null : costo / unidades });
  const e = economiaDe("X", [p(29.99, 1, 5), p(49.99, 2, 10), p(29.99, 1, null, null), p(0, 1, 5)]);
  assert.equal(e.pedidos, 3);
  assert.equal(e.venta, 36.66);
  assert.equal(e.unidades, 1.33);
  assert.equal(e.costoProducto, 7.5);
  assert.equal(e.costeados, 2);
  assert.equal(e.costoUnitario, 5);
  assert.equal(e.fuente, "compras_pais");
  assert.equal(economiaDe("Y", []).venta, null);
});

test("hasta qué CPA de Meta no se pierde y cuánto deja cada venta entregada", () => {
  const e = { clave: "X", pedidos: 40, venta: 39.99, unidades: 1.2, costoUnitario: 5, costoProducto: 6, costeados: 40, fuente: "compras_pais" as const };
  // Envía 80 %, entrega 75 %: envíos = 6.27 + 0.25 × 6.27 = 7.84; quedan para anuncios 39.99 − 6 − 7.84 − 2.25 = 23.90; CPA de Meta para no perder = 23.90 × 0.6 = 14.34.
  const costo = costoPorVenta(10, 0.8, 0.75, C);
  const r = rentabilidadDe(e, 0.8, 0.75, C, costo)!;
  assert.equal(r.paraAnuncios, 23.9);
  assert.equal(r.cpaParaNoPerder, 14.34);
  // Con CPA de $10: CPA real 16.67 → ganancia 39.99 − 6 − (16.667 + 7.838 + 2.25) = 7.24.
  assert.equal(r.ganancia, 7.24);
  assert.equal(r.pierde, false);
  const caro = rentabilidadDe(e, 0.8, 0.75, C, costoPorVenta(16, 0.8, 0.75, C))!;
  assert.equal(caro.pierde, true);
  // Producto que no deja nada aunque el anuncio sea gratis.
  assert.equal(rentabilidadDe({ ...e, venta: 12 }, 0.8, 0.75, C, costo)!.cpaParaNoPerder, 0);
});

test("sin datos suficientes no se calcula", () => {
  const e = { clave: "X", pedidos: 40, venta: 39.99, unidades: 1, costoUnitario: 5, costoProducto: 5, costeados: 40, fuente: "compras_pais" as const };
  assert.equal(rentabilidadDe({ ...e, pedidos: 3 }, 0.8, 0.75, C, null), null);
  assert.equal(rentabilidadDe({ ...e, costoProducto: null }, 0.8, 0.75, C, null), null);
  assert.equal(rentabilidadDe(e, null, 0.75, C, null), null);
  assert.equal(rentabilidadDe(null, 0.8, 0.75, C, null), null);
  assert.equal(rentabilidadDe(e, 0.8, 0.75, C, null)!.ganancia, null);
});
