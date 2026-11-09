import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { anchoDeColumna, nombreArchivoXlsx, tablaAXlsx, tipoDeColumna } from "./xlsx";
import type { DefTabla } from "./motor";

interface Fila {
  codigo: string;
  barras: string;
  fisico: number;
  precio: number;
  dia: string;
}

const DEF: DefTabla<Fila> = {
  clave: "prueba",
  campos: [{ id: "dia", etiqueta: "Día", tipo: "fecha", valor: (f) => f.dia }],
  csvAntes: [
    { etiqueta: "Código", valor: (f) => f.codigo },
    { etiqueta: "Código de barras", valor: (f) => f.barras },
    { etiqueta: "Físico", valor: (f) => f.fisico },
    { etiqueta: "Precio", valor: (f) => f.precio },
  ],
};

test("el tipo de una columna sale de lo que trae", () => {
  assert.equal(tipoDeColumna("texto", [1, 2, 3]), "entero");
  assert.equal(tipoDeColumna("texto", [1, 2.5]), "dinero");
  assert.equal(tipoDeColumna("texto", [1, "a"]), "texto");
  assert.equal(tipoDeColumna("fecha", ["2026-11-09", "2026-11-10"]), "fecha");
  assert.equal(tipoDeColumna("fecha", ["no es fecha"]), "texto");
  assert.equal(tipoDeColumna("texto", ["", null]), "texto");
});

test("el ancho de una columna cabe su contenido, entre un mínimo y un máximo", () => {
  assert.equal(anchoDeColumna("A", ["x"]), 8);
  assert.equal(anchoDeColumna("Producto", ["Aceite de Semilla de Calabaza"]), 31);
  assert.equal(anchoDeColumna("Nota", ["x".repeat(200)]), 48);
});

test("el archivo se llama como la tabla y el día", () => {
  assert.equal(nombreArchivoXlsx("wms-stock", new Date("2026-11-09T12:00:00Z")), "wms-stock-2026-11-09.xlsx");
});

test("el Excel lleva números como números, el código de barras como texto, la fecha como fecha y los títulos con filtro", async () => {
  const bytes = await tablaAXlsx(DEF, [
    { codigo: "ACEITE/UNO", barras: "2000000000886", fisico: 431, precio: 12.5, dia: "2026-11-09" },
    { codigo: "=SUMA(1;1)", barras: "", fisico: -3, precio: 0, dia: "" },
  ], "Inventario");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes as unknown as ArrayBuffer);
  const hoja = libro.getWorksheet("Inventario")!;
  assert.deepEqual([1, 2, 3, 4, 5].map((c) => hoja.getRow(1).getCell(c).value), ["Código", "Código de barras", "Físico", "Precio", "Día"]);
  assert.equal(hoja.getCell("C2").value, 431);
  assert.equal(typeof hoja.getCell("C2").value, "number");
  assert.equal(hoja.getCell("C3").value, -3);
  assert.equal(hoja.getCell("D2").value, 12.5);
  assert.equal(hoja.getCell("B2").value, "2000000000886");
  assert.ok(hoja.getCell("E2").value instanceof Date);
  // Un texto que parece fórmula se queda como texto.
  assert.equal(hoja.getCell("A3").value, "=SUMA(1;1)");
  assert.equal(hoja.views[0].state, "frozen");
  assert.ok(hoja.autoFilter);
});
