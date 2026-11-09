import test from "node:test";
import assert from "node:assert/strict";
import { csvAntiguedad, reporteAntiguedad } from "./reporte-antiguedad";

test("agrupa por quien, reparte por edad y ordena por lo más viejo", () => {
  const f = reporteAntiguedad([
    { quien: "Ana", pendiente: 10, dias: 1 },
    { quien: "Ana", pendiente: 5, dias: 9 },
    { quien: "Beto", pendiente: 20, dias: 20 },
    { quien: "Cata", pendiente: 0, dias: 2 },
  ]);
  assert.deepEqual(f.map((x) => x.quien), ["Beto", "Ana"]);
  assert.equal(f[1].d0_3, 10);
  assert.equal(f[1].d8_14, 5);
  assert.equal(f[1].total, 15);
});
test("CSV con BOM, CRLF y protección de fórmulas", () => {
  const c = csvAntiguedad(reporteAntiguedad([{ quien: "=Z", pendiente: 1, dias: 0 }]));
  assert.ok(c.startsWith("﻿Quién,"));
  assert.ok(c.includes("\r\n"));
  assert.ok(!c.includes("\r\n=Z"));
});
