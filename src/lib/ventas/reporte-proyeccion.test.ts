import test from "node:test";
import assert from "node:assert/strict";
import { csvProyeccion, reporteProyeccion, tasaHistorica } from "./reporte-proyeccion";

test("proyecta con la tasa histórica", () => {
  const f = reporteProyeccion({ enRuta: [{ cod: 100 }, { cod: 100 }], pendientesRemesa: 50, entregadas: 80, perdidas: 20 });
  assert.equal(f[0].monto, 200);
  assert.equal(f[1].monto, 160);
  assert.equal(f[3].monto, 210);
});
test("sin historia no inventa entregas", () => {
  assert.equal(tasaHistorica(0, 0), 0);
  assert.equal(reporteProyeccion({ enRuta: [{ cod: 10 }], pendientesRemesa: 0, entregadas: 0, perdidas: 0 })[3].monto, 0);
});
test("CSV con BOM y CRLF", () => {
  const c = csvProyeccion(reporteProyeccion({ enRuta: [], pendientesRemesa: 0, entregadas: 1, perdidas: 0 }));
  assert.ok(c.startsWith("﻿Concepto,Monto") && c.includes("\r\n"));
});
