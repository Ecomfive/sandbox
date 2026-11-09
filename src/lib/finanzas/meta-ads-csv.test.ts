import { test } from "node:test";
import assert from "node:assert/strict";
import { claveFilaMeta, leerCsv, leerCsvMeta, leerFecha, leerNumero } from "./meta-ads-csv";

test("números en varios formatos", () => {
  assert.equal(leerNumero("1,234.56"), 1234.56);
  assert.equal(leerNumero("1.234,56"), 1234.56);
  assert.equal(leerNumero("12,5"), 12.5);
  assert.equal(leerNumero("$ 10"), 10);
  assert.equal(leerNumero(""), 0);
  assert.equal(leerNumero("abc"), null);
});

test("fechas", () => {
  assert.equal(leerFecha("2026-09-03"), "2026-09-03");
  assert.equal(leerFecha("03/09/2026"), "2026-09-03");
  assert.equal(leerFecha("2026-02-30"), null);
  assert.equal(leerFecha("ayer"), null);
});

test("CSV con comillas y punto y coma", () => {
  assert.deepEqual(leerCsv('a;b\n"x;y";"di ""hola"""\n'), [["a", "b"], ["x;y", 'di "hola"']]);
});

test("exportación de Meta en español: suma por día, campaña y conjunto y salta el total", () => {
  const csv = [
    "﻿Inicio del informe,Fin del informe,Nombre de la campaña,Nombre del conjunto de anuncios,Importe gastado (USD),Compras",
    "2026-09-01,2026-09-01,TIENDA X - Lámpara,Público 1,10.50,2",
    "2026-09-01,2026-09-01,TIENDA X - Lámpara,Público 1,4.50,1",
    "2026-09-02,2026-09-02,TIENDA X - Lámpara,Público 1,8,",
    ",,,,23,3",
    "fecha mala,,Otra,,1,0",
  ].join("\n");
  const r = leerCsvMeta(csv);
  assert.equal(r.moneda, "USD");
  assert.deepEqual(r.faltan, []);
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].gasto, 15);
  assert.equal(r.filas[0].compras, 3);
  assert.equal(r.filas[1].compras, 0);
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0].fila, 6);
});

test("exportación en inglés por día", () => {
  const r = leerCsvMeta("Day,Campaign name,Ad set name,Amount spent (USD),Purchases\n2026-09-05,Promo,AS,3.2,1\n");
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].conjunto, "AS");
});

test("faltan columnas", () => {
  assert.deepEqual(leerCsvMeta("Nombre,Monto\nA,1\n").faltan.length, 3);
});

test("la llave no distingue mayúsculas ni acentos", () => {
  assert.equal(claveFilaMeta({ fecha: "2026-09-01", campana: "Lámpara  X", conjunto: "" }), claveFilaMeta({ fecha: "2026-09-01", campana: "lampara x", conjunto: "" }));
});
