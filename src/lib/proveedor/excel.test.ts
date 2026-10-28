import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { filasAXlsx, nombreArchivoExcel, nombreHoja } from "./excel";

const leer = (bytes: Uint8Array) => XLSX.read(bytes, { type: "array", cellDates: true });

test("el Excel lleva los títulos, los números como números y las fechas como fechas", () => {
  const bytes = filasAXlsx(
    "En producción",
    [
      { titulo: "Producto", tipo: "texto" },
      { titulo: "Unidades", tipo: "entero" },
      { titulo: "Total", tipo: "dinero" },
      { titulo: "Confirmado", tipo: "fecha" },
    ],
    [
      ["Crema 50 ml", 1500, 2390.5, "2026-10-28"],
      ["丰胸霜", null, null, null],
    ],
  );
  const libro = leer(bytes);
  assert.deepEqual(libro.SheetNames, ["En producción"]);
  const hoja = libro.Sheets["En producción"];
  assert.equal(hoja["A1"].v, "Producto");
  assert.equal(hoja["B2"].t, "n");
  assert.equal(hoja["B2"].v, 1500);
  assert.equal(hoja["C2"].v, 2390.5);
  assert.equal(hoja["D2"].t, "d");
  assert.equal((hoja["D2"].v as Date).toISOString().slice(0, 10), "2026-10-28");
  assert.equal(hoja["A3"].v, "丰胸霜");
  assert.equal(hoja["B3"], undefined, "una celda vacía queda vacía, no en cero");
  assert.equal(XLSX.utils.sheet_to_json(hoja).length, 2);
});

test("un texto que parece fórmula queda como texto", () => {
  const hoja = leer(filasAXlsx("Datos", [{ titulo: "Nota", tipo: "texto" }], [["=1+1"], ["+cmd|' /C calc'!A0"]])).Sheets["Datos"];
  assert.equal(hoja["A2"].t, "s");
  assert.equal(hoja["A2"].f, undefined);
  assert.equal(hoja["A2"].v, "=1+1");
  assert.equal(hoja["A3"].t, "s");
});

test("sin filas el archivo igual trae los títulos; una fecha mal escrita o un número que no lo es quedan como texto", () => {
  const vacio = leer(filasAXlsx("X", [{ titulo: "A" }, { titulo: "B", tipo: "fecha" }], [])).Sheets["X"];
  assert.equal(vacio["A1"].v, "A");
  assert.equal(vacio["B1"].v, "B");
  const raro = leer(filasAXlsx("X", [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Monto", tipo: "dinero" }], [["12 nov", "mucho"]])).Sheets["X"];
  assert.equal(raro["A2"].v, "12 nov");
  assert.equal(raro["B2"].v, "mucho");
});

test("nombre de la hoja y del archivo", () => {
  assert.equal(nombreHoja("Pagos: [2026] / saldo?"), "Pagos 2026 saldo");
  assert.equal(nombreHoja("x".repeat(60)).length, 31);
  assert.equal(nombreHoja("***"), "Hoja");
  assert.equal(nombreArchivoExcel("En producción", new Date("2026-10-28T15:00:00Z")), "ecomfive-en-producci-n-2026-10-28.xlsx");
  assert.equal(nombreArchivoExcel("pagos", new Date("2026-10-28T15:00:00Z")), "ecomfive-pagos-2026-10-28.xlsx");
});
