import { test } from "node:test";
import assert from "node:assert/strict";
import { compraEn, nombrePais, paisesDondeVende } from "./origen-chat";

test("los países donde vende salen del CRM, sin repetir", () => {
  assert.deepEqual(paisesDondeVende(["CR", null], [{ pais: "MX" }, { pais: "CR" }]), ["CR", "MX"]);
  assert.deepEqual(paisesDondeVende([], []), []);
});

test("dónde compra, sin repetir", () => {
  assert.deepEqual(compraEn([{ plataforma: "Dropi" }, { plataforma: "Dropi" }, { plataforma: "Shopify" }, { plataforma: null }]), ["Dropi", "Shopify"]);
  assert.equal(nombrePais("CR"), "Costa Rica");
});
