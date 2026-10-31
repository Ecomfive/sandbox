import assert from "node:assert/strict";
import test from "node:test";
import { fulfillmentEnMoneda, leerFulfillment, MAX_FULFILLMENT, monedasFulfillment, montoConMoneda } from "./fulfillment-pais";

test("leerFulfillment: dólares con hasta dos decimales, con punto, coma o el signo $", () => {
  assert.deepEqual(leerFulfillment("2"), { valor: 2 });
  assert.deepEqual(leerFulfillment("1.50"), { valor: 1.5 });
  assert.deepEqual(leerFulfillment(" 1,5 "), { valor: 1.5 });
  assert.deepEqual(leerFulfillment("$2.25"), { valor: 2.25 });
  assert.deepEqual(leerFulfillment("₡1010"), { valor: 1010 });
  assert.deepEqual(leerFulfillment("0"), { valor: 0 });
});

test("leerFulfillment: vacío = el país no tiene uno (se escribe en cada publicación)", () => {
  assert.deepEqual(leerFulfillment(""), { valor: null });
  assert.deepEqual(leerFulfillment("   "), { valor: null });
});

test("leerFulfillment: lo que no es un monto válido da error", () => {
  for (const malo of ["dos", "-1", "1.234", "1e3", "2,5,0", String(MAX_FULFILLMENT + 1)]) assert.ok("error" in leerFulfillment(malo), malo);
});

test("fulfillmentEnMoneda: en la misma moneda tal cual; si no, por el tipo de cambio (enteros en colones o pesos)", () => {
  const porUsd = { CRC: 505.3, MXN: 18.42 };
  assert.equal(fulfillmentEnMoneda(1.5, "USD", "PA", porUsd), 1.5);
  assert.equal(fulfillmentEnMoneda(2, "USD", "CR", porUsd), 1011);
  assert.equal(fulfillmentEnMoneda(2, "USD", "mx", porUsd), 37);
  assert.equal(fulfillmentEnMoneda(1000, "CRC", "CR", {}), 1000, "en colones para Costa Rica no necesita tipo de cambio");
  assert.equal(fulfillmentEnMoneda(1010.6, "CRC", "PA", porUsd), 2);
  assert.equal(fulfillmentEnMoneda(2, "USD", "CR", {}), null, "sin tipo de cambio no se adivina");
});

test("monedasFulfillment: dólares y la del país", () => {
  assert.deepEqual(monedasFulfillment("PA"), ["USD"]);
  assert.deepEqual(monedasFulfillment("CR"), ["USD", "CRC"]);
  assert.deepEqual(monedasFulfillment("MX"), ["USD", "MXN"]);
});

test("montoConMoneda: dólares, colones y pesos sin confundirse", () => {
  assert.equal(montoConMoneda(2, "USD"), "US$2.00");
  assert.equal(montoConMoneda(1011, "CRC").replace(/\s/g, " "), "₡1 011");
  assert.equal(montoConMoneda(37.5, "MXN"), "MX$37,5");
  assert.equal(montoConMoneda(null, "USD"), "sin dato");
});
