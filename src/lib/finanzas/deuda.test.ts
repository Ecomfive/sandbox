import assert from "node:assert/strict";
import { test } from "node:test";
import { cuotaFrancesa, estadoLinea, leerTasa, pagosDeuda, saldoAl, saldoFrances, sumarMesesFecha, tablaAmortizacion, type Prestamo } from "./deuda";

const prestamo: Prestamo = {
  id: "p1",
  nombre: "Préstamo de prueba",
  acreedor: "Banco Ejemplo",
  clase: "prestamo",
  monto: 10_000,
  tasaAnual: 0.12,
  plazoMeses: 12,
  fechaDesembolso: "2026-01-10",
  primerVencimiento: "2026-01-31",
  tipoId: null,
  cuentaId: null,
};

test("cuota francesa: 10 000 al 12 % en 12 meses", () => {
  assert.equal(cuotaFrancesa(10_000, 0.12, 12), 888.49);
  assert.equal(cuotaFrancesa(1_200, 0, 12), 100);
});

test("la tabla termina en cero y suma el capital prestado", () => {
  const t = tablaAmortizacion(prestamo);
  assert.equal(t.length, 12);
  assert.equal(t.at(-1)!.saldo, 0);
  assert.equal(Math.round(t.reduce((a, c) => a + c.capital, 0) * 100) / 100, 10_000);
  assert.equal(t[0].interes, 100);
});

test("las fechas siguen el día del primer vencimiento y se recortan a fin de mes", () => {
  assert.equal(sumarMesesFecha("2026-01-31", 1), "2026-02-28");
  assert.equal(sumarMesesFecha("2026-01-31", 2), "2026-03-31");
  assert.equal(sumarMesesFecha("2026-11-15", 3), "2027-02-15");
  assert.deepEqual(tablaAmortizacion(prestamo).slice(0, 3).map((c) => c.fecha), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("el saldo cerrado coincide con la tabla (misma fórmula que la migración)", () => {
  const t = tablaAmortizacion(prestamo);
  for (const k of [1, 5, 11]) assert.ok(Math.abs(saldoFrances(10_000, 0.12, 12, k) - t[k - 1].saldo) <= 0.05, `cuota ${k}`);
  assert.equal(saldoFrances(10_000, 0.12, 12, 12), 0);
  assert.equal(saldoFrances(1_200, 0, 12, 3), 900);
});

test("saldo al corte: antes del desembolso nada; corriente lo de los próximos 12 meses", () => {
  assert.equal(saldoAl(prestamo, "2026-01-01").saldo, 0);
  const s = saldoAl(prestamo, "2026-03-31");
  assert.equal(s.cuotasPagadas, 3);
  assert.equal(s.noCorriente, 0);
  assert.equal(s.corriente, s.saldo);
  assert.equal(s.proxima?.numero, 4);
  const largo = saldoAl({ ...prestamo, plazoMeses: 36 }, "2026-02-15");
  assert.ok(largo.noCorriente > 0 && largo.corriente > 0);
  assert.equal(Math.round((largo.corriente + largo.noCorriente) * 100) / 100, largo.saldo);
});

test("línea de crédito: disponible, intereses y alertas", () => {
  const l = { id: "l1", nombre: "Línea", banco: null, cupo: 20_000, usado: 18_500, usadoAl: "2026-10-01", tasaAnual: 0.12, fechaRenovacion: "2026-11-10" };
  const e = estadoLinea(l, "2026-10-23");
  assert.equal(e.disponible, 1_500);
  assert.equal(e.interesesMes, 185);
  assert.equal(e.diasParaRenovar, 18);
  assert.deepEqual(e.alertas, ["renovacion", "uso_alto"]);
  assert.deepEqual(estadoLinea({ ...l, usado: 0, fechaRenovacion: "2026-10-01" }, "2026-10-23").alertas, ["vencida"]);
});

test("pagos de deuda en una ventana: cuotas e intereses al fin de mes", () => {
  const l = { id: "l1", nombre: "Línea", banco: null, cupo: 20_000, usado: 12_000, usadoAl: "2026-10-01", tasaAnual: 0.12, fechaRenovacion: null };
  const p = pagosDeuda([prestamo], [l], "2026-02-01", "2026-03-31");
  assert.deepEqual(p.map((x) => [x.fecha, x.origen]), [
    ["2026-02-28", "prestamo"],
    ["2026-02-28", "linea"],
    ["2026-03-31", "prestamo"],
    ["2026-03-31", "linea"],
  ]);
  assert.equal(p[1].monto, 120);
});

test("leer una tasa en porcentaje", () => {
  assert.equal(leerTasa("12"), 0.12);
  assert.equal(leerTasa("12,5 %"), 0.125);
  assert.equal(leerTasa(""), 0);
  assert.equal(leerTasa("abc"), null);
});
