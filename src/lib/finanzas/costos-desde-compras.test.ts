import { test } from "node:test";
import assert from "node:assert/strict";
import { lotesDesdeCompras } from "./costos-desde-compras";
import type { CostoPuesto } from "./compras-costos";

const compra = (extra: Partial<CostoPuesto>): CostoPuesto & { financiamiento?: { total: number } | null } => ({
  compraId: "c1",
  codigo: "OC-1",
  nombre: "Compra",
  proveedor: "Shen Zhen",
  etapa: "completado",
  abierta: false,
  fechaLlegada: "2026-10-05",
  fob: 1000,
  gastos: 200,
  gastosPorConcepto: {},
  gastosPendientes: 0,
  total: 1200,
  unidades: 300,
  unitarioReal: 4,
  unitarioVigente: null,
  diferencia: null,
  pesoGastos: 0.2,
  lineas: [
    { skuId: "s1", codigo: "A", producto: "Crema", cantidad: 100, fob: 600, gastos: 120, unitarioReal: 7.2, vigente: null, diferencia: null },
    { skuId: "s2", codigo: "B", producto: "Gel", cantidad: 200, fob: 400, gastos: 80, unitarioReal: 2.4, vigente: null, diferencia: null },
  ],
  ...extra,
});

test("un lote por producto con el costo puesto y el financiamiento por FOB", () => {
  const lotes = lotesDesdeCompras([compra({ financiamiento: { total: 50 } } as never)], (sku, p) => (sku === "s1" ? "crema vieja" : p.toLowerCase()));
  assert.equal(lotes.length, 2);
  const [a, b] = lotes;
  assert.equal(a.origen_clave, "compra:c1:s1");
  assert.equal(a.producto_clave, "crema vieja");
  assert.equal(a.costo_unitario, 6);
  assert.equal(a.envio, 1.2);
  assert.equal(a.financiamiento, 0.3);
  assert.equal(a.costo_total, 7.5);
  assert.equal(b.financiamiento, 0.1);
  assert.equal(b.costo_total, 2.5);
});

test("sin llegada o abierta no deja lote", () => {
  assert.equal(lotesDesdeCompras([compra({ fechaLlegada: null })], (_, p) => p).length, 0);
  assert.equal(lotesDesdeCompras([compra({ abierta: true })], (_, p) => p).length, 0);
});
