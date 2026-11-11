import { test } from "node:test";
import assert from "node:assert/strict";
import { avancePrepago, cuotasPrepago, hastaPrepago, lineasDevengoDelMes, type Prepago } from "./devengos";

const seguro: Prepago = { id: "p", concepto: "Seguro", monto: 1000, desde: "2026-11-01", meses: 12, periodoPago: "2026-10-01", pagoEnEerr: true };

test("cuotas iguales que suman el total", () => {
  const c = cuotasPrepago(seguro);
  assert.equal(c.length, 12);
  assert.equal(c[0].monto, 83.33);
  assert.equal(c[11].periodo, "2027-10-01");
  assert.equal(Math.round(c.reduce((a, x) => a + x.monto, 0) * 100) / 100, 1000);
  assert.equal(hastaPrepago(seguro), "2027-10-01");
});

test("el mes del pago saca el pago del EERR; los meses cubiertos llevan su cuota", () => {
  assert.deepEqual(lineasDevengoDelMes(seguro, "2026-10-01").map((l) => [l.clase, l.monto]), [["pago", -1000]]);
  assert.deepEqual(lineasDevengoDelMes(seguro, "2026-12-01").map((l) => [l.ref, l.monto]), [["cuota:2", 83.33]]);
  assert.deepEqual(lineasDevengoDelMes({ ...seguro, pagoEnEerr: false }, "2026-10-01"), []);
  assert.deepEqual(lineasDevengoDelMes({ ...seguro, activo: false }, "2026-12-01"), []);
  // Pagado el mismo mes que empieza: dos líneas.
  assert.equal(lineasDevengoDelMes({ ...seguro, periodoPago: null }, "2026-11-01").length, 2);
});

test("avance", () => {
  assert.deepEqual(avancePrepago(seguro, "2027-01-01"), { devengado: 249.99, porDevengar: 750.01, cuotas: 3, de: 12 });
});
