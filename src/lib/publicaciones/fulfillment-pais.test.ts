import assert from "node:assert/strict";
import test from "node:test";
import { leerFulfillment, MAX_FULFILLMENT } from "./fulfillment-pais";

test("leerFulfillment: dólares con hasta dos decimales, con punto, coma o el signo $", () => {
  assert.deepEqual(leerFulfillment("2"), { valor: 2 });
  assert.deepEqual(leerFulfillment("1.50"), { valor: 1.5 });
  assert.deepEqual(leerFulfillment(" 1,5 "), { valor: 1.5 });
  assert.deepEqual(leerFulfillment("$2.25"), { valor: 2.25 });
  assert.deepEqual(leerFulfillment("0"), { valor: 0 });
});

test("leerFulfillment: vacío = el país no tiene uno (se escribe en cada publicación)", () => {
  assert.deepEqual(leerFulfillment(""), { valor: null });
  assert.deepEqual(leerFulfillment("   "), { valor: null });
});

test("leerFulfillment: lo que no es un monto válido da error", () => {
  for (const malo of ["dos", "-1", "1.234", "1e3", "2,5,0", String(MAX_FULFILLMENT + 1)]) assert.ok("error" in leerFulfillment(malo), malo);
});
