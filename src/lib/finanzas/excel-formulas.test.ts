import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { celdasPlanilla, escribirLibro, hojaPlanilla, vistaCongelada, type Planilla } from "./excel-formulas";
import { planillaEerr, planillaFlujo, planillaPorCuenta } from "./excel-reportes";
import type { Fila } from "./eerr-filas";
import type { FilaEstadoFlujo } from "./flujo";

const M = ["2026-01-01", "2026-02-01"];
const pm = (a: number, b: number) => ({ [M[0]]: a, [M[1]]: b });

// EERR inventado: ingresos 1000/1200 (con una devolución), costo 400/500, administración 100/100, marketing 200/300.
const filasEerr: Fila[] = [
  { clave: "ingresos", etiqueta: "Ingresos", tipo: "seccion", valores: pm(1000, 1200) },
  { clave: "ingresos-Ventas", etiqueta: "Ventas", tipo: "detalle", valores: pm(1050, 1200) },
  { clave: "ingresos-Devolución", etiqueta: "Devolución", tipo: "detalle", valores: pm(-50, 0) },
  { clave: "ingresos-netos", etiqueta: "Ingresos netos", tipo: "resultado", valores: pm(1000, 1200) },
  { clave: "costo_ventas", etiqueta: "Costo de ventas", tipo: "seccion", valores: pm(400, 500) },
  { clave: "costo_ventas-Mercancía", etiqueta: "Mercancía", tipo: "detalle", valores: pm(400, 500) },
  { clave: "margen-bruto", etiqueta: "Margen bruto", tipo: "resultado", valores: pm(600, 700) },
  { clave: "margen-bruto-pct", etiqueta: "Margen bruto %", tipo: "porcentaje", valores: pm(600, 700), base: pm(1000, 1200) },
  { clave: "administracion", etiqueta: "Administración", tipo: "seccion", valores: pm(100, 100) },
  { clave: "administracion-Oficina", etiqueta: "Oficina", tipo: "detalle", valores: pm(100, 100) },
  { clave: "marketing", etiqueta: "Marketing", tipo: "seccion", valores: pm(200, 300) },
  { clave: "marketing-Ads", etiqueta: "Ads", tipo: "detalle", valores: pm(200, 300) },
  { clave: "ebitda", etiqueta: "EBITDA", tipo: "resultado", valores: pm(300, 300) },
  { clave: "resultado-neto", etiqueta: "Resultado neto", tipo: "resultado", valores: pm(300, 300) },
];

test("EERR: secciones como SUM, resultados como suma con signo, total como SUM y margen como cociente", () => {
  const p: Planilla = { nombreHoja: "EERR", titulo: "x", columnas: ["ene", "feb"], filas: planillaEerr(filasEerr, M) };
  const c = celdasPlanilla(p, 3);
  // Ingresos (fila 4 de Excel): SUM de sus dos detalles.
  assert.equal(c[0][0].formula, "SUM(B5:B6)");
  assert.equal(c[0][2].formula, "SUM(B4:C4)");
  assert.equal(c[0][2].valor, 2200);
  // Margen bruto = ingresos netos − costo de ventas.
  assert.equal(c[6][1].formula, "C7-C8");
  // EBITDA = margen bruto − administración − marketing.
  assert.equal(c[12][0].formula, "B10-B12-B14");
  // Resultado neto = ingresos − todas las secciones de costo.
  assert.equal(c[13][0].formula, "B4-B8-B12-B14");
  // Margen %: cociente que no divide por cero.
  assert.equal(c[7][0].formula, 'IF(B7=0,"",B10/B7)');
  assert.equal(c[7][0].valor, 0.6);
});

test("una fórmula que no da el valor del portal se descarta (queda el número)", () => {
  const malas = filasEerr.map((f) => (f.clave === "ebitda" ? { ...f, valores: pm(999, 300) } : f));
  const c = celdasPlanilla({ nombreHoja: "x", titulo: "x", columnas: ["a", "b"], filas: planillaEerr(malas, M) }, 3);
  assert.equal(c[12][0].formula, undefined);
  assert.equal(c[12][0].valor, 999);
  assert.ok(c[12][1].formula);
});

test("flujo: bloque = entradas − salidas, neto, y la caja inicial arrastra la final del mes anterior", () => {
  const filas: FilaEstadoFlujo[] = [
    { clave: "caja-inicial", etiqueta: "Caja inicial", tipo: "resultado", valores: pm(100, 150), total: 100 },
    { clave: "operativo", etiqueta: "Operativo", tipo: "seccion", valores: pm(50, -20) },
    { clave: "operativo-entrada-Ventas", etiqueta: "Ventas (entrada)", tipo: "detalle", valores: pm(80, 30) },
    { clave: "operativo-salida-Gastos", etiqueta: "Gastos", tipo: "detalle", valores: pm(30, 50) },
    { clave: "neto", etiqueta: "Flujo neto", tipo: "resultado", valores: pm(50, -20) },
    { clave: "caja-final", etiqueta: "Caja final", tipo: "resultado", valores: pm(150, 130), total: 130 },
  ];
  const c = celdasPlanilla({ nombreHoja: "F", titulo: "F", columnas: ["a", "b"], filas: planillaFlujo(filas, M) }, 3);
  assert.equal(c[1][0].formula, "B6-B7");
  assert.equal(c[4][1].formula, "C5");
  assert.equal(c[5][0].formula, "B4+B8");
  assert.equal(c[0][1].formula, "B9");
  assert.equal(c[0][2].formula, "B4");
  assert.equal(c[5][2].formula, "C9");
});

test("por cuenta: saldo final = SUM del detalle y saldo inicial = final del mes anterior", () => {
  const filas: FilaEstadoFlujo[] = [
    { clave: "c1-final", etiqueta: "Banco", tipo: "grupo", valores: pm(120, 140), total: 140 },
    { clave: "c1-inicial", etiqueta: "Saldo inicial", tipo: "detalle", valores: pm(100, 120), total: 100 },
    { clave: "c1-entradas", etiqueta: "Entradas", tipo: "detalle", valores: pm(50, 40) },
    { clave: "c1-salidas", etiqueta: "Salidas", tipo: "detalle", valores: pm(-30, -20) },
  ];
  const c = celdasPlanilla({ nombreHoja: "C", titulo: "C", columnas: ["a", "b"], filas: planillaPorCuenta(filas, M) }, 3);
  assert.equal(c[0][0].formula, "SUM(B5:B7)");
  assert.equal(c[1][1].formula, "B4");
  assert.equal(c[0][2].formula, "C4");
});

test("el libro sale con fórmulas, formato de número y el encabezado congelado", () => {
  const hoja = hojaPlanilla({ nombreHoja: "EERR", titulo: "Estado", columnas: ["ene", "feb"], filas: planillaEerr(filasEerr, M) });
  const buf = escribirLibro([{ nombre: "EERR", hoja }]);
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  const ws = wb.Sheets.EERR;
  assert.equal(ws.B4.f, "SUM(B5:B6)");
  assert.equal(ws.D4.f, "SUM(B4:C4)");
  const zip = (XLSX.CFB as unknown as { read: (b: Buffer, o: object) => { FullPaths: string[]; FileIndex: { content: Uint8Array }[] } }).read(buf, { type: "buffer" });
  const k = zip.FullPaths.findIndex((p) => p.endsWith("xl/worksheets/sheet1.xml"));
  const xml = Buffer.from(zip.FileIndex[k].content).toString("utf8");
  assert.match(xml, /<pane xSplit="1" ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"\/>/);
  assert.match(xml, /<\/sheetViews>(<sheetFormatPr|<cols>|<sheetData)/);
});

test("vistaCongelada: solo filas", () => {
  assert.match(vistaCongelada(1, 0), /ySplit="1" topLeftCell="A2" activePane="bottomLeft"/);
});
