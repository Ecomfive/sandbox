import { test } from "node:test";
import assert from "node:assert/strict";
import { leerMetricasDescripcion, metricasDeTest, precioUnidad, textoLogistica } from "./cotizacion";

const DESCRIPCION = `**Landing:** [https://oferfystore.com/products/mini](https://oferfystore.com/products/mini)

**Métricas (Panamá 🇵🇦 - Fecha del Test 28/08/2026):**

| Métrica | Valor |
| ---| --- |
| Oferta | $39.99 |
| CPM | 🔴 $7.87 |
| % Efectividad página destino | 🟢 80.58% |
| CPA | 🟡 $3.05 |
| Compras | 8 |`;

test("lee las métricas de la descripción con sus puntos de color", () => {
  const m = leerMetricasDescripcion(DESCRIPCION);
  assert.equal(m?.titulo, "Métricas (Panamá - Fecha del Test 28/08/2026)");
  assert.deepEqual(m?.filas, [
    { nombre: "Oferta", valor: "$39.99", color: null },
    { nombre: "CPM", valor: "$7.87", color: "rojo" },
    { nombre: "% Efectividad página destino", valor: "80.58%", color: "verde" },
    { nombre: "CPA", valor: "$3.05", color: "amarillo" },
    { nombre: "Compras", valor: "8", color: null },
  ]);
  assert.equal(leerMetricasDescripcion("Sin métricas aquí"), null);
  assert.equal(leerMetricasDescripcion(null), null);
});

test("arma las métricas desde el test si la descripción no las trae", () => {
  const vacio = { metrica_oferta: null, metrica_cpm: null, metrica_efectividad: null, metrica_hook_rate: null, metrica_ctr: null, metrica_gasto: null, metrica_compras: null, metrica_cvr: null };
  const m = metricasDeTest({ ...vacio, fecha_test: "2026-08-28", metrica_cpa: 3.05, metrica_compras: 8 }, "Panamá");
  assert.equal(m?.titulo, "Métricas (Panamá - Fecha del Test 28/08/2026)");
  assert.deepEqual(m?.filas, [
    { nombre: "CPA", valor: "$3.05", color: null },
    { nombre: "Compras", valor: "8", color: null },
  ]);
  assert.equal(metricasDeTest({ ...vacio, fecha_test: null, metrica_cpa: null }, "Panamá"), null);
});

test("logística y precio por unidad", () => {
  assert.equal(textoLogistica("DDP", ["mar"]), "DDP BY SEA");
  assert.equal(textoLogistica(null, ["aire"]), "BY AIR");
  assert.equal(textoLogistica("DAP", []), "DAP");
  assert.equal(precioUnidad(8420, 1008), 8.35);
  assert.equal(precioUnidad(8420, 0), null);
});
