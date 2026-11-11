import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { comprasDelLibro, itbmsIncluido, libroContador, totalesPorTipo, type MovimientoContador } from "./libro-contador";

const mov = (o: Partial<MovimientoContador>): MovimientoContador => ({
  fecha: "2026-09-10",
  ruc: "1-2-3",
  proveedor: "Proveedor inventado",
  documento: "F-1",
  total: 107,
  itbms: 7,
  tipo: "Publicidad",
  seccion: "marketing",
  cuenta: "Banco",
  tienda: "TIENDA A",
  ...o,
});

test("solo compras y gastos (fuera ingresos, patrimoniales y pagos de tarjeta)", () => {
  const c = comprasDelLibro([mov({}), mov({ seccion: "ingresos" }), mov({ seccion: "pago_tdc" }), mov({ seccion: "patrimonial" })]);
  assert.equal(c.length, 1);
});

test("totales por tipo: base = total − ITBMS (sin ITBMS cargado, base = total)", () => {
  const t = totalesPorTipo([mov({}), mov({ total: 50, itbms: null }), mov({ tipo: "Envíos", total: 10, itbms: null })]);
  const p = t.find((x) => x.tipo === "Publicidad")!;
  assert.deepEqual([p.total, p.itbms, p.base, p.documentos], [157, 7, 150, 2]);
  assert.equal(itbmsIncluido(107), 7);
});

test("el Excel trae las tres hojas, base como fórmula y SUMIF por tipo", () => {
  const buf = libroContador([mov({}), mov({ proveedor: "=HYPERLINK(1)", total: 20, itbms: null })], [{ fecha: "2026-09-02", documento: "FV-1", orden: "#1", tienda: "TIENDA A", total: 107 }], "septiembre de 2026");
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  assert.deepEqual(wb.SheetNames, ["Resumen por tipo", "Compras y gastos", "Ventas facturadas"]);
  const c = wb.Sheets["Compras y gastos"];
  assert.equal(c.E4.f, "G4-F4");
  assert.equal(c.G6.f, "SUM(G4:G5)");
  // Un texto que empieza con «=» no se vuelve fórmula.
  const prov = [c.C4.v, c.C5.v];
  assert.ok(prov.includes("'=HYPERLINK(1)"));
  const r = wb.Sheets["Resumen por tipo"];
  assert.match(String(r.E4.f), /^SUMIF\('Compras y gastos'!\$H\$4:\$H\$5,A4,'Compras y gastos'!\$G\$4:\$G\$5\)$/);
  const v = wb.Sheets["Ventas facturadas"];
  assert.equal(v.F4.v, 7);
  assert.equal(v.G5.f, "SUM(G4:G4)");
});
