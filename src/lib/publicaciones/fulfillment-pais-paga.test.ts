import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fulfillmentQueCuenta, puedeElegirQuienPaga, quienPagaFulfillment } from "./fulfillment-pais";

describe("quién paga el fulfillment", () => {
  it("un valor desconocido o ausente es «nosotros»", () => {
    assert.equal(quienPagaFulfillment("dropshipper"), "dropshipper");
    assert.equal(quienPagaFulfillment("nosotros"), "nosotros");
    assert.equal(quienPagaFulfillment(undefined), "nosotros");
    assert.equal(quienPagaFulfillment("otro"), "nosotros");
  });
  it("si lo paga el dropshipper, no cuenta", () => {
    assert.equal(fulfillmentQueCuenta(1500, "dropshipper"), null);
    assert.equal(fulfillmentQueCuenta(1500, "nosotros"), 1500);
    assert.equal(fulfillmentQueCuenta(null, "nosotros"), null);
  });
  it("Dropi no se elige: siempre lo pagamos nosotros", () => {
    assert.equal(puedeElegirQuienPaga("Dropi"), false);
    assert.equal(puedeElegirQuienPaga(" dropi "), false);
    assert.equal(puedeElegirQuienPaga("Drop"), true);
    assert.equal(puedeElegirQuienPaga("Effi"), true);
    assert.equal(puedeElegirQuienPaga("Dunamixfy"), true);
  });
});
