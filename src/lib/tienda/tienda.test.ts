import assert from "node:assert/strict";
import test from "node:test";
import { prepararContexto } from "../publicaciones/vincular";
import { pedidosPorDia, productosVendidos, resumirPedidos, type LineaVendida, type PedidoResumen } from "./resumen";
import { nombreVariante, sugerirParaVariante, textosDeSku, tituloVariante } from "./vincular-variante";

const p = (estado: PedidoResumen["estado"], total: number, unidades = 1, creado = "2026-11-02T15:00:00Z"): PedidoResumen => ({ estado, total, unidades, creado });

test("resumen: estados, porcentajes y dinero contra entrega", () => {
  const r = resumirPedidos([p("nuevo", 30), p("confirmado", 40, 2), p("en_camino", 50), p("entregado", 60, 2), p("entregado", 40), p("devuelto", 25), p("cancelado", 99)]);
  assert.equal(r.pedidos, 7);
  assert.equal(r.confirmados, 5, "confirmado, en camino, 2 entregados y el devuelto");
  assert.equal(r.confirmacion, 71.4);
  assert.equal(r.entrega, 50, "2 entregados de 4 que salieron");
  assert.equal(r.cancelacion, 14.3);
  assert.equal(r.devolucion, 14.3);
  assert.equal(r.unidadesPorPedido, 1.29);
  assert.equal(r.facturado, 245, "todo menos lo cancelado");
  assert.equal(r.recaudado, 100);
  assert.equal(r.porRecaudar, 50);
  assert.equal(r.devueltoMonto, 25);
  assert.equal(r.ticketPromedio, 40.83);
});

test("resumen sin pedidos: porcentajes vacíos, no cero dividido", () => {
  const r = resumirPedidos([]);
  assert.equal(r.pedidos, 0);
  assert.equal(r.confirmacion, null);
  assert.equal(r.entrega, null);
  assert.equal(r.ticketPromedio, null);
});

test("pedidos por día en hora de Panamá, con los días vacíos en cero", () => {
  const dias = pedidosPorDia(
    [{ creado: "2026-11-01T14:00:00Z" }, { creado: "2026-11-02T02:30:00Z" }, { creado: "2026-11-03T15:00:00Z" }],
    "2026-10-31",
    "2026-11-03",
  );
  // El de las 02:30 UTC del 2 nov es la noche del 1 nov en Panamá.
  assert.deepEqual(dias, [
    { dia: "2026-10-31", pedidos: 0 },
    { dia: "2026-11-01", pedidos: 2 },
    { dia: "2026-11-02", pedidos: 0 },
    { dia: "2026-11-03", pedidos: 1 },
  ]);
});

test("productos vendidos: por producto nuestro, sin cancelados ni lo que no sale de bodega; lo sin vincular junto", () => {
  const l = (id: number | null, cantidad: number, precio: number, pedidoId: string, estado: LineaVendida["estado"] = "entregado"): LineaVendida => ({ shopifyVarianteId: id, titulo: "x", cantidad, precio, estado, pedidoId });
  const vinculos = new Map<number, string | "no_fisico">([
    [1, "faja"],
    [2, "faja"],
    [3, "no_fisico"],
  ]);
  const r = productosVendidos([l(1, 1, 30, "a"), l(2, 2, 30, "b"), l(3, 1, 5, "b"), l(9, 1, 40, "c"), l(1, 5, 30, "d", "cancelado")], vinculos);
  assert.deepEqual(r, [
    { skuId: "faja", unidades: 3, pedidos: 2, ingreso: 90, porcentaje: 69.2 },
    { skuId: null, unidades: 1, pedidos: 1, ingreso: 40, porcentaje: 30.8 },
  ]);
});

test("variantes: «Default Title» no es parte del nombre", () => {
  assert.equal(tituloVariante("Default Title"), null);
  assert.equal(nombreVariante({ productoTitulo: "Crema de cúrcuma", varianteTitulo: "Default Title" }), "Crema de cúrcuma");
  assert.equal(nombreVariante({ productoTitulo: "Faja reductora", varianteTitulo: "M" }), "Faja reductora · M");
});

test("sugerencia: el SKU de Shopify igual al nuestro es exacta; con otro SKU, por el nombre", () => {
  const ctx = prepararContexto(
    [
      { id: "fm", codigo: "FAJA/REDUCTORA/M", nombre: "Faja reductora M", tipo: "simple", huella: null },
      { id: "cc", codigo: "CREMA/CURCUMA", nombre: "Crema de curcuma", tipo: "simple", huella: null },
    ],
    [],
  );
  const exacta = sugerirParaVariante({ productoTitulo: "Faja", varianteTitulo: "M", sku: "FAJA/REDUCTORA/M", huella: null }, ctx);
  assert.equal(exacta.tipo, "seguro");
  assert.equal(exacta.skuId, "fm");
  const porNombre = sugerirParaVariante({ productoTitulo: "Crema de cúrcuma", varianteTitulo: "Default Title", sku: "KN-CURCUMA-50", huella: null }, ctx);
  assert.equal(porNombre.skuId, "cc");
  const nada = sugerirParaVariante({ productoTitulo: "Cepillo alisador", varianteTitulo: "Negro", sku: "KN-CEP", huella: null }, ctx);
  assert.equal(nada.tipo, "ninguno");
});

test("sugerencia: un SKU de Shopify «N.º/CÓDIGO» (así está en Kenku) es exacto con nuestro código", () => {
  assert.deepEqual(textosDeSku("0007/ACEITE/BATANA/ROMERO"), ["0007/ACEITE/BATANA/ROMERO", "ACEITE/BATANA/ROMERO"]);
  assert.deepEqual(textosDeSku(" NEOCELL "), ["NEOCELL"]);
  assert.deepEqual(textosDeSku(null), []);
  const ctx = prepararContexto([{ id: "ab", codigo: "ACEITE/BATANA/ROMERO", nombre: "Aceite de Batana y Romero", tipo: "simple", huella: null }], []);
  const r = sugerirParaVariante({ productoTitulo: "Batana Oil Premium", varianteTitulo: "Default Title", sku: "0007/ACEITE/BATANA/ROMERO", huella: null }, ctx);
  assert.equal(r.tipo, "seguro");
  assert.equal(r.skuId, "ab");
});
