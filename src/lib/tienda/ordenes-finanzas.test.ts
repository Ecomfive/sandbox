import assert from "node:assert/strict";
import test from "node:test";
import { entradaDeOrden, estadoDesdeFinanzas, momentoDeFecha, nombreComparable, vendidosDeFinanzas, zonaDeEtiquetas } from "./ordenes-finanzas";
import { diaPanama } from "./resumen";

test("el estado del Excel de Finanzas pasa al de la pantalla, igual que el ciclo de Finanzas", () => {
  assert.equal(estadoDesdeFinanzas("entregada", null), "entregado");
  assert.equal(estadoDesdeFinanzas("en_transito", null), "en_camino");
  assert.equal(estadoDesdeFinanzas("devuelta", null), "devuelto");
  assert.equal(estadoDesdeFinanzas("cancelada", null), "cancelado");
  assert.equal(estadoDesdeFinanzas("no_gestionada", null), "cancelado");
  assert.equal(estadoDesdeFinanzas("pendiente", "CIUDAD, Confirmada, easysell_cod_form"), "confirmado");
  assert.equal(estadoDesdeFinanzas("pendiente", "CIUDAD, easysell_cod_form"), "nuevo");
  assert.equal(estadoDesdeFinanzas(null, null), "nuevo");
});

test("la zona sale de las etiquetas", () => {
  assert.equal(zonaDeEtiquetas("CIUDAD, Confirmada"), "Ciudad");
  assert.equal(zonaDeEtiquetas("Carrito recuperado, Confirmada, INTERIOR/SERVIENTREGA"), "Interior");
  assert.equal(zonaDeEtiquetas("Confirmada"), null);
  assert.equal(zonaDeEtiquetas(null), null);
});

test("la fecha del Excel cae en el mismo día de Panamá", () => {
  assert.equal(diaPanama(momentoDeFecha("2026-10-13")), "2026-10-13");
});

test("Kenku de la tienda y KENKU de Finanzas son la misma", () => {
  assert.equal(nombreComparable("Kenku"), nombreComparable("KENKU"));
  assert.equal(nombreComparable(" Calzados  Ó. "), "CALZADOS O.");
});

test("lo vendido: por producto vinculado o por nombre; sin cancelados ni servicios; el ingreso sin precio se reparte del total", () => {
  const pedidos = new Map([
    ["a", { estado: "entregado" as const, total: 30 }],
    ["b", { estado: "cancelado" as const, total: 99 }],
    ["c", { estado: "confirmado" as const, total: 20 }],
  ]);
  const v = vendidosDeFinanzas(
    [
      { pedidoId: "a", titulo: "Magnesio", skuId: null, cantidad: 2, precio: null, esServicio: false },
      { pedidoId: "a", titulo: "Colágeno", skuId: "sku-1", cantidad: 1, precio: null, esServicio: false },
      { pedidoId: "a", titulo: "Envío", skuId: null, cantidad: 1, precio: null, esServicio: true },
      { pedidoId: "b", titulo: "Magnesio", skuId: null, cantidad: 5, precio: null, esServicio: false },
      { pedidoId: "c", titulo: "magnesio ", skuId: null, cantidad: 1, precio: 20, esServicio: false },
    ],
    pedidos,
  );
  assert.deepEqual(
    v.map((x) => [x.titulo, x.skuId, x.unidades, x.pedidos, x.ingreso]),
    [
      ["Magnesio", null, 3, 2, 40],
      ["Colágeno", "sku-1", 1, 1, 10],
    ],
  );
  assert.equal(v[0].porcentaje, 80);
});

test("por dónde entró: el bot (etiqueta «chatbot»), Shopify o el Excel", () => {
  assert.equal(entradaDeOrden("shopify", "CIUDAD, chatbot, Confirmada"), "bot");
  assert.equal(entradaDeOrden("shopify", "Chatbot"), "bot");
  assert.equal(entradaDeOrden("shopify", "easysell_cod_form, CIUDAD"), "shopify");
  assert.equal(entradaDeOrden("shopify", null), "shopify");
  assert.equal(entradaDeOrden("GESTION_OCEANS_PANAMA.xlsx", "chatbot"), null);
});
