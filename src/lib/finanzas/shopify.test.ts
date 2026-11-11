import assert from "node:assert/strict";
import test from "node:test";
import { huella } from "./libro-excel";
import { estadoDeShopify, leerTiendasShopify, metodoDeShopify, ordenDeShopify, reembolsado, siguientePagina } from "./shopify";
import { llaveOrden } from "../ventas/matriz";

const orden = {
  name: "#1001",
  created_at: "2026-09-02T02:30:00Z",
  financial_status: "paid",
  fulfillment_status: "fulfilled",
  total_price: "50.00",
  subtotal_price: "45.00",
  total_discounts: "0.00",
  total_shipping_price_set: { shop_money: { amount: "5.00" } },
  payment_gateway_names: ["Cash on Delivery (COD)"],
  line_items: [{ title: "Producto inventado", quantity: 2, sku: "SKU-1" }],
  refunds: [{ transactions: [{ kind: "refund", status: "success", amount: "10.00" }] }],
  shipping_address: { first_name: "Ana", last_name: "Prueba", phone: "60000000" },
};

test("configuración: solo dominios myshopify.com con token", () => {
  assert.deepEqual(leerTiendasShopify(undefined), []);
  assert.deepEqual(leerTiendasShopify("no json"), []);
  assert.deepEqual(
    leerTiendasShopify(JSON.stringify([{ tienda: "TIENDA", dominio: "mi-tienda.myshopify.com", token: "t" }, { tienda: "X", dominio: "evil.com", token: "t" }, { tienda: "Y", dominio: "y.myshopify.com" }])),
    [{ tienda: "TIENDA", dominio: "mi-tienda.myshopify.com", token: "t" }],
  );
});

test("la orden lleva la misma huella que el importador de Excel y la fecha de Panamá", () => {
  const o = ordenDeShopify("TIENDA", orden)!;
  assert.equal(o.origen_clave, huella(`ventas|${llaveOrden("TIENDA", "#1001")}`));
  // 02:30 UTC del 2 de septiembre son las 21:30 del 1 en Panamá.
  assert.equal(o.fecha, "2026-09-01");
  assert.equal(o.periodo, "2026-09-01");
  assert.equal(o.total, 40);
  assert.equal(o.metodo_pago, "efectivo");
  assert.equal(o.estado_entrega, "en_transito");
  assert.equal(o.lineas[0].cantidad, 2);
  assert.equal(ordenDeShopify("TIENDA", { ...orden, line_items: [] }), null);
});

test("estados, reembolsos y paginación", () => {
  assert.equal(estadoDeShopify({ cancelled_at: "x" }), "cancelada");
  assert.equal(estadoDeShopify({ financial_status: "refunded" }), "devuelta");
  assert.equal(estadoDeShopify({}), "pendiente");
  assert.equal(metodoDeShopify({ payment_gateway_names: ["Yappy"] }), "yappy");
  assert.equal(reembolsado({ refunds: [{ transactions: [{ kind: "refund", status: "failure", amount: "5" }] }] }), 0);
  assert.equal(
    siguientePagina('<https://x.myshopify.com/admin/api/2024-10/orders.json?page_info=a>; rel="previous", <https://x.myshopify.com/admin/api/2024-10/orders.json?page_info=b>; rel="next"'),
    "https://x.myshopify.com/admin/api/2024-10/orders.json?page_info=b",
  );
  assert.equal(siguientePagina('<https://evil.com/x>; rel="next"'), null);
  assert.equal(siguientePagina(null), null);
});
