import test from "node:test";
import assert from "node:assert/strict";
import { csvProductos, reporteProductos } from "./reporte-productos";

test("suma por producto, ignora canceladas y ordena por unidades", () => {
  const f = reporteProductos([
    { producto: "A", cantidad: 2, precio: 10, fase: "entregada", orden: "1" },
    { producto: "A", cantidad: 1, precio: 10, fase: "fallida", orden: "2" },
    { producto: "A", cantidad: 9, precio: 10, fase: "cancelada", orden: "3" },
    { producto: "B", cantidad: 5, precio: 1, fase: "por_confirmar", orden: "4" },
  ]);
  assert.deepEqual(f.map((x) => x.producto), ["B", "A"]);
  assert.equal(f[1].unidades, 3);
  assert.equal(f[1].ingreso, 30);
  assert.equal(f[1].ordenes, 2);
  assert.equal(f[1].pctEntrega, 66.67);
  assert.equal(f[0].pctEntrega, null);
});
test("CSV con BOM, CRLF y fórmulas protegidas", () => {
  const c = csvProductos(reporteProductos([{ producto: "=X", cantidad: 1, precio: 1, fase: null, orden: "1" }]));
  assert.ok(c.startsWith("﻿Producto,") && c.includes("\r\n") && !c.includes("\r\n=X"));
});
