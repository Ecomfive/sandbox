import assert from "node:assert/strict";
import { test } from "node:test";
import { formatoEnDolares, formatoMonto, MONEDA_DOLAR, monedaPublicaciones, simboloMoneda } from "./moneda";

test("Panamá: en dólares como siempre y sin valor en dólares aparte", () => {
  const m = monedaPublicaciones("PA", { CRC: 510 });
  assert.deepEqual(m, MONEDA_DOLAR);
  assert.equal(formatoMonto(8.99, m), "$8.99");
  assert.equal(formatoMonto(-1.2, m), "-$1.20");
  assert.equal(formatoMonto(null, m), "—");
  assert.equal(formatoEnDolares(8.99, m), null);
  assert.equal(simboloMoneda(m), "$");
});

test("Costa Rica: en colones y con su valor en dólares del día", () => {
  const m = monedaPublicaciones("CR", { USD: 1, CRC: 510 });
  assert.deepEqual(m, { moneda: "CRC", porUsd: 510 });
  // es-CR separa los miles con un espacio fino; se compara sin espacios.
  assert.equal(formatoMonto(5499, m).replace(/\s/g, ""), "₡5499");
  assert.equal(formatoMonto(5499.5, m).replace(/\s/g, ""), "₡5499,5");
  assert.equal(formatoEnDolares(5499, m), "US$10.78");
  assert.equal(formatoEnDolares(-510, m), "-US$1.00");
  assert.equal(simboloMoneda(m), "₡");
  // Sin tasa del día: solo colones.
  assert.equal(formatoEnDolares(5499, monedaPublicaciones("cr", {})), null);
});
