import { test } from "node:test";
import assert from "node:assert/strict";
import { csvMotivos, motivosFallo } from "./motivos-fallo";

test("cuenta por motivo y fase, con texto libre de respaldo", () => {
  const f = motivosFallo([
    { fase: "fallida", motivo_codigo: "no_contesta", motivo_texto: null },
    { fase: "devuelta", motivo_codigo: "no_contesta", motivo_texto: null },
    { fase: "cancelada", motivo_codigo: null, motivo_texto: "Se arrepintió" },
    { fase: "entregada", motivo_codigo: null, motivo_texto: null },
    { fase: "fallida", motivo_codigo: null, motivo_texto: null },
  ]);
  assert.equal(f[0].motivo, "No contesta");
  assert.equal(f[0].total, 2);
  assert.equal(f[0].fallidas, 1);
  assert.equal(f[0].devueltas, 1);
  assert.equal(f.length, 3);
  assert.ok(f.some((x) => x.motivo === "Sin motivo"));
  assert.ok(Math.abs(f.reduce((s, x) => s + x.porcentaje, 0) - 1) < 1e-9);
});

test("csv con BOM y encabezado", () => {
  const c = csvMotivos(motivosFallo([{ fase: "fallida", motivo_codigo: "rechazo", motivo_texto: null }]));
  assert.ok(c.startsWith("﻿Motivo,"));
  assert.match(c, /Rechazó el pedido,1,0,0,1,100.0%/);
});
