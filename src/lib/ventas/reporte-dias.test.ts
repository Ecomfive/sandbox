import test from "node:test";
import assert from "node:assert/strict";
import { csvDias, reporteDias } from "./reporte-dias";

test("serie diaria con días vacíos en cero y canceladas fuera de lo vendido", () => {
  const f = reporteDias(
    [
      { fecha: "2026-11-01", fase: "entregada", total: 10 },
      { fecha: "2026-11-01", fase: "cancelada", total: 5 },
      { fecha: "2026-11-03", fase: "por_confirmar", total: 7.5 },
      { fecha: "2026-10-01", fase: "entregada", total: 99 },
    ],
    "2026-11-01",
    "2026-11-03",
  );
  assert.equal(f.length, 3);
  assert.deepEqual([f[0].ordenes, f[0].vendido, f[0].entregadas, f[0].canceladas], [2, 10, 1, 1]);
  assert.equal(f[1].ordenes, 0);
  assert.equal(f[2].vendido, 7.5);
});
test("CSV con BOM y CRLF", () => {
  const c = csvDias(reporteDias([], "2026-11-01", "2026-11-01"));
  assert.ok(c.startsWith("﻿Fecha,") && c.includes("\r\n"));
});
