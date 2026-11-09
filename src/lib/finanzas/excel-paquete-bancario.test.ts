import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { libroPaqueteBancario } from "./excel-paquete-bancario";
import { indicadoresBancarios, concentracionVentas, type InsumosIndicadores } from "./paquete-bancario";
import type { SnapshotPaquete } from "./cargar-paquete-bancario";

const insumos: InsumosIndicadores = {
  ventas: 1200,
  ventasAnterior: null,
  costoVentas: 600,
  margenBruto: 600,
  ebitda: -10,
  intereses: 0,
  cxc: 120,
  inventario: 300,
  cxp: 90,
  caja: 50,
  deudaFinanciera: 480,
  activoCorriente: 470,
  pasivoCorriente: 235,
  mesesConDatos: 12,
};

const snap: SnapshotPaquete = {
  version: 1,
  corte: "2026-09-01",
  entidad: "consolidado",
  alcance: "Consolidado",
  moneda: "USD",
  secciones: ["resumen", "indicadores", "deuda", "concentracion", "limitaciones"],
  generado: "2026-10-26T12:00:00.000Z",
  empresa: { nombre: "Empresa de prueba", ruc: null },
  carta: "## Presentación\nTexto de prueba",
  meses: ["2026-09-01"],
  indicadores: { insumos, valores: indicadoresBancarios(insumos), serie: [] },
  eerr: null,
  balance: null,
  flujo: null,
  cartera: null,
  deuda: {
    prestamos: [
      { nombre: "Préstamo A", acreedor: "Banco", clase: "Préstamo", monto: 1000, tasaAnual: 0.12, plazoMeses: 12, cuota: 88.85, desembolso: "2026-01-01", saldo: 400, corriente: 400, noCorriente: 0, proxima: "2026-10-01" },
    ],
    lineas: [{ nombre: "Línea", banco: "Banco", cupo: 500, usado: 80, usadoAl: "2026-09-30", tasaAnual: 0.1, renovacion: null }],
    total: 480,
  },
  proyeccion: null,
  concentracion: concentracionVentas([
    { nombre: "A", ventas: 900 },
    { nombre: "B", ventas: 300 },
  ]),
  notas: [],
  limitaciones: [{ clave: "no-auditadas", severidad: "alta", texto: "Cifras de gestión, no auditadas." }],
};

test("el libro trae una hoja por sección elegida y las fórmulas con su valor", () => {
  const wb = XLSX.read(libroPaqueteBancario(snap), { type: "buffer", cellFormula: true });
  assert.deepEqual(wb.SheetNames, ["Resumen", "Indicadores", "Deuda", "Concentración", "Limitaciones"]);
  const ind = wb.Sheets.Indicadores;
  assert.equal(ind.B20.f, 'IF(B4>0,B7/B4,"")');
  assert.equal(ind.B20.v, 0.5);
  // EBITDA negativo con deuda: «n. s.», no una división.
  assert.equal(ind.B27.v, "n. s.");
  assert.equal(ind.B29.v, "");
  const deuda = wb.Sheets.Deuda;
  assert.equal(deuda.H5.f, "SUM(H4:H4)");
  const conc = wb.Sheets.Concentración;
  assert.equal(conc.B6.f, "SUM(B4:B5)");
  assert.equal(conc.C4.v, 0.75);
  assert.match(String(wb.Sheets.Resumen.A13?.v ?? ""), /Presentación/);
});
