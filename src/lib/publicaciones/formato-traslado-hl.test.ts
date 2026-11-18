import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { armarFormatoTrasladoHL, fechaDelFormato, FILAS_DEL_FORMATO, lineasDelFormato, nombreArchivoFormato } from "./formato-traslado-hl";

const base = { viejo: 8946, nuevo: 12034, nombre: "Truly Smooth Legend After Shave" };

test("sin variaciones, una sola línea con el total y presentación «Estándar»", () => {
  assert.deepEqual(lineasDelFormato({ ...base, unidades: 237, variaciones: [] }), [{ idItem: "8946 → 12034", descripcion: "Truly Smooth Legend After Shave", presentacion: "Estándar", unidades: 237 }]);
  assert.equal(lineasDelFormato({ ...base, unidades: null, variaciones: [] })[0].unidades, 0, "sin dato no se inventa");
});

test("con variaciones, una línea por cada una con unidades (las vacías no van)", () => {
  const l = lineasDelFormato({ ...base, unidades: 999, variaciones: [{ etiqueta: "Negro / M", unidades: 10 }, { etiqueta: "Negro / L", unidades: 0 }, { etiqueta: "Rojo / S", unidades: 4.4 }] });
  assert.deepEqual(l.map((x) => [x.presentacion, x.unidades]), [["Negro / M", 10], ["Rojo / S", 4]]);
});

test("con más variaciones que filas, las últimas se juntan en una y el total cuadra", () => {
  const vars = Array.from({ length: 20 }, (_, i) => ({ etiqueta: `V${i + 1}`, unidades: i + 1 }));
  const l = lineasDelFormato({ ...base, unidades: null, variaciones: vars });
  assert.equal(l.length, FILAS_DEL_FORMATO);
  assert.equal(l.at(-1)?.presentacion, "Otras 6 variaciones");
  assert.equal(l.reduce((t, x) => t + x.unidades, 0), 210);
});

test("fecha y nombre del archivo", () => {
  assert.equal(fechaDelFormato("2026-11-18"), "18/11/2026");
  assert.equal(fechaDelFormato("18-11-2026"), null);
  assert.equal(nombreArchivoFormato(8946, 12034), "Traslado HL Express ID 8946 a 12034.xlsx");
});

test("el Excel sale con la plantilla de HL Express, los datos del traslado, el logo y las fórmulas de total", async () => {
  const buf = await armarFormatoTrasladoHL({
    ...base,
    unidades: null,
    variaciones: [{ etiqueta: "Negro / M", unidades: 10 }, { etiqueta: "Rojo / S", unidades: 5 }],
    origen: "Bodega Dropi Panamá (B280)",
    fecha: "2026-11-18",
    publicacion: "PUB-0441",
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const h = wb.worksheets[0];
  assert.match(String(h.getCell("A1").value), /MANIFIESTO DE ENTREGA DE MERCANC.A/);
  assert.equal(h.getImages().length, 1, "conserva el logo");
  assert.equal(h.getCell("E5").value, "18/11/2026");
  assert.equal(h.getCell("B6").value, "ECOMFIVE");
  assert.equal(h.getCell("E6").value, "Traslado del ID 8946 al ID 12034 · PUB-0441");
  assert.equal(h.getCell("B8").value, "Bodega Dropi Panamá (B280)");
  assert.equal(h.getCell("E8").value, "HL Express Panamá");
  assert.equal(h.getCell("B5").value, null, "el número de remisión lo pone quien lo manda");
  assert.equal(h.getCell("B7").value, null);
  assert.equal(h.getCell("E7").value, null);
  assert.deepEqual([h.getCell("A12").value, h.getCell("C12").value, h.getCell("D12").value], ["8946 → 12034", "Negro / M", 10]);
  assert.deepEqual([h.getCell("C13").value, h.getCell("D13").value], ["Rojo / S", 5]);
  assert.equal(h.getCell("B14").value, null, "la fila de ejemplo de la plantilla se limpia");
  const f12 = h.getCell("F12").value as { formula: string; result: number };
  assert.deepEqual([f12.formula, f12.result], ["D12*E12", 10]);
  assert.equal((h.getCell("D27").value as { result: number }).result, 15);
  assert.match(String((h.getCell("D27").value as { formula: string }).formula), /SUM\(D12:D26\)/);
});
