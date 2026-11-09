import test from "node:test";
import assert from "node:assert/strict";
import { csvMargen, reporteMargen } from "./reporte-margen";

const base = { fecha: "2026-11-01", envio: 3, costoEnvio: 2 };
test("ordena de peor a mejor y no inventa margen sin costo", () => {
  const f = reporteMargen([
    { ...base, numero: "A", total: 50, costoMercancia: 10 },
    { ...base, numero: "B", total: 20, costoMercancia: 25 },
    { ...base, numero: "C", total: 30, costoMercancia: null },
  ]);
  assert.deepEqual(f.map((x) => x.numero), ["B", "A", "C"]);
  assert.equal(f[0].neto, -7);
  assert.equal(f[1].neto, 38);
  assert.equal(f[2].neto, null);
});
test("CSV con BOM, CRLF y protección de fórmulas", () => {
  const c = csvMargen(reporteMargen([{ ...base, numero: "=X", total: 10, costoMercancia: null }]));
  assert.ok(c.startsWith("﻿Orden,"));
  assert.ok(c.includes("\r\n"));
  assert.ok(!c.includes(",=X") && !c.includes("\r\n=X"));
});

test("resta la pasarela con tarjeta y el mensajero propio (no el de una transportadora)", () => {
  const costos = { pasarelaTarjeta: { pct: 2.9, fijo: 0.3 }, mensajeroPorDefecto: 3.5 };
  const [f] = reporteMargen([{ numero: "T", fecha: "2026-11-01", total: 100, envio: 0, costoEnvio: 0, costoMercancia: 40, metodo: "tarjeta", mensajeroPropio: true }], costos);
  assert.equal(f.pasarela, 3.2);
  assert.equal(f.mensajero, 3.5);
  assert.equal(f.neto, 53.3);
  const [g] = reporteMargen([{ numero: "S", fecha: "2026-11-01", total: 100, envio: 0, costoEnvio: 6, costoMercancia: 40, metodo: "efectivo", mensajeroPropio: true, tarifaMensajero: 4 }], costos);
  assert.equal(g.mensajero, 0);
  assert.equal(g.pasarela, 0);
});
test("tarifa propia del mensajero manda; sin ninguna se avisa", () => {
  const [f] = reporteMargen([{ numero: "M", fecha: "2026-11-01", total: 50, envio: 0, costoEnvio: 0, costoMercancia: 10, mensajeroPropio: true, tarifaMensajero: 4 }], { pasarelaTarjeta: { pct: 0, fijo: 0 }, mensajeroPorDefecto: 3 });
  assert.equal(f.mensajero, 4);
  const [g] = reporteMargen([{ numero: "N", fecha: "2026-11-01", total: 50, envio: 0, costoEnvio: 0, costoMercancia: 10, mensajeroPropio: true }]);
  assert.equal(g.mensajeroSinTarifa, true);
});
