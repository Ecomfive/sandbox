import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canalDe, canalSugerido, SIN_CANAL } from "./canales";

test("el canal guardado o sin canal", () => {
  assert.equal(canalDe("dropi"), "dropi");
  assert.equal(canalDe(null), SIN_CANAL);
  assert.equal(canalDe("tiktok"), SIN_CANAL);
});

test("la sugerencia sale del nombre y de las órdenes", () => {
  assert.equal(canalSugerido({ nombre: "TIENDA CLICKSI", clase: "tienda" }), "clicksi");
  assert.equal(canalSugerido({ nombre: "ECOMFIVE", clase: "tienda" }), "dropi");
  assert.equal(canalSugerido({ nombre: "TIENDA X", clase: "tienda", ordenesShopify: 3 }), "shopify");
  assert.equal(canalSugerido({ nombre: "TIENDA X", clase: "tienda" }), null);
  assert.equal(canalSugerido({ nombre: "CORPORATIVO", clase: "gestion", ordenesShopify: 3 }), null);
});
