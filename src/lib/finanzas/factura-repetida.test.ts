import { test } from "node:test";
import assert from "node:assert/strict";
import { facturasRepetidas, numeroFactura, rucBase } from "./factura-repetida";

test("normaliza el número y el RUC", () => {
  assert.equal(numeroFactura("001-0001234"), "10001234");
  assert.equal(numeroFactura(" 0001234 "), "1234");
  assert.equal(rucBase("8-123-456 DV 12"), "8123456");
  assert.equal(rucBase(null), "");
});

test("misma factura y mismo RUC: repetidas", () => {
  const r = facturasRepetidas([
    { id: "a", periodo: "2026-08-01", monto: 100, facturaNumero: "F-0099", ruc: "155-1-2 DV 3" },
    { id: "b", periodo: "2026-09-01", monto: 120, facturaNumero: "f 99", ruc: "155-1-2" },
  ]);
  assert.deepEqual(r.get("a"), [{ id: "b", periodo: "2026-09-01", monto: 120 }]);
  assert.equal(r.get("b")?.[0].id, "a");
});

test("distinto RUC no es repetida; sin RUC pide el mismo monto", () => {
  const r = facturasRepetidas([
    { id: "a", periodo: "2026-08-01", monto: 100, facturaNumero: "1234", ruc: "111" },
    { id: "b", periodo: "2026-08-01", monto: 100, facturaNumero: "1234", ruc: "222" },
    { id: "c", periodo: "2026-08-01", monto: 50, facturaNumero: "5678", ruc: null },
    { id: "d", periodo: "2026-08-01", monto: 60, facturaNumero: "5678", ruc: "333" },
    { id: "e", periodo: "2026-08-01", monto: 70, facturaNumero: "9999", ruc: null },
    { id: "f", periodo: "2026-08-01", monto: 70, facturaNumero: "9999", ruc: null },
  ]);
  assert.equal(r.has("a"), false);
  assert.equal(r.has("c"), false);
  assert.equal(r.get("e")?.[0].id, "f");
});

test("lo anulado y los números cortos no cuentan", () => {
  const r = facturasRepetidas([
    { id: "a", periodo: "2026-08-01", monto: 1, facturaNumero: "12", ruc: null },
    { id: "b", periodo: "2026-08-01", monto: 1, facturaNumero: "12", ruc: null },
    { id: "c", periodo: "2026-08-01", monto: 5, facturaNumero: "4444", ruc: null },
    { id: "d", periodo: "2026-08-01", monto: 5, facturaNumero: "4444", ruc: null, anulado: true },
  ]);
  assert.equal(r.size, 0);
});
