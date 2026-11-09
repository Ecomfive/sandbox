import test from "node:test";
import assert from "node:assert/strict";
import { csvTiendas, reporteTiendas } from "./reporte-tiendas";

test("resume por tienda, sin contar canceladas como vendido", () => {
  const f = reporteTiendas([
    { tienda: "A", fase: "entregada", total: 100 },
    { tienda: "A", fase: "fallida", total: 50 },
    { tienda: "A", fase: "cancelada", total: 30 },
    { tienda: "B", fase: "por_confirmar", total: 500 },
  ]);
  assert.deepEqual(f.map((x) => x.tienda), ["B", "A"]);
  const a = f[1];
  assert.equal(a.vendido, 150);
  assert.equal(a.pctEntrega, 50);
  assert.equal(f[0].pctEntrega, null);
});
test("CSV con BOM, CRLF y fórmulas protegidas", () => {
  const c = csvTiendas(reporteTiendas([{ tienda: "=X", fase: null, total: 1 }]));
  assert.ok(c.startsWith("﻿Tienda,") && c.includes("\r\n") && !c.includes("\r\n=X"));
});
