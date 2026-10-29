import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { filasAXlsx, nombreArchivoExcel, nombreHoja, type CargarImagen } from "./excel";

const leer = (bytes: Uint8Array) => XLSX.read(bytes, { type: "array", cellDates: true });

test("el Excel lleva los títulos, los números como números y las fechas como fechas", async () => {
  const bytes = await filasAXlsx(
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

test("un texto que parece fórmula queda como texto", async () => {
  const hoja = leer(await filasAXlsx("Datos", [{ titulo: "Nota", tipo: "texto" }], [["=1+1"], ["+cmd|' /C calc'!A0"]])).Sheets["Datos"];
  assert.equal(hoja["A2"].t, "s");
  assert.equal(hoja["A2"].f, undefined);
  assert.equal(hoja["A2"].v, "=1+1");
  assert.equal(hoja["A3"].t, "s");
});

test("sin filas el archivo igual trae los títulos; una fecha mal escrita o un número que no lo es quedan como texto", async () => {
  const vacio = leer(await filasAXlsx("X", [{ titulo: "A" }, { titulo: "B", tipo: "fecha" }], [])).Sheets["X"];
  assert.equal(vacio["A1"].v, "A");
  assert.equal(vacio["B1"].v, "B");
  const raro = leer(await filasAXlsx("X", [{ titulo: "Fecha", tipo: "fecha" }, { titulo: "Monto", tipo: "dinero" }], [["12 nov", "mucho"]])).Sheets["X"];
  assert.equal(raro["A2"].v, "12 nov");
  assert.equal(raro["B2"].v, "mucho");
});

// Un PNG de 1×1 píxel.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

test("las fotos van dentro de su celda: cada dirección se trae una vez y la que falla deja la celda vacía", async () => {
  const pedidas: string[] = [];
  const cargar: CargarImagen = async (url) => {
    pedidas.push(url);
    return url.includes("rota") ? null : { base64: `data:image/png;base64,${PNG}`, extension: "png", ancho: 200, alto: 100 };
  };
  const columnas = [{ titulo: "Foto", tipo: "imagen" as const }, { titulo: "Producto", tipo: "texto" as const }];
  const bytes = await filasAXlsx("Fotos", columnas, [["https://x/a.png", "Uno"], ["https://x/a.png", "Dos"], ["https://x/rota.png", "Tres"], [null, "Cuatro"]], cargar);
  assert.deepEqual(pedidas.sort(), ["https://x/a.png", "https://x/rota.png"]);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = libro.getWorksheet("Fotos")!;
  const imagenes = ws.getImages();
  assert.equal(imagenes.length, 2);
  assert.deepEqual(imagenes.map((i) => i.range.tl.nativeRow).sort(), [1, 2]);
  assert.ok(imagenes.every((i) => i.range.tl.nativeCol === 0));
  assert.equal(ws.getRow(2).height, ws.getRow(3).height);
  assert.ok((ws.getRow(2).height ?? 0) > 30, "la fila con foto es más alta");
  // La celda de la foto no lleva la dirección como texto.
  const hoja = leer(bytes).Sheets["Fotos"];
  assert.equal(hoja["A2"], undefined);
  assert.equal(hoja["B4"].v, "Tres");
  // Sin quien traiga las fotos, el archivo sale igual, sin imágenes.
  const sinFotos = new ExcelJS.Workbook();
  await sinFotos.xlsx.load((await filasAXlsx("Fotos", columnas, [["https://x/a.png", "Uno"]])) as unknown as ArrayBuffer);
  assert.equal(sinFotos.getWorksheet("Fotos")!.getImages().length, 0);
});

test("nombre de la hoja y del archivo", () => {
  assert.equal(nombreHoja("Pagos: [2026] / saldo?"), "Pagos 2026 saldo");
  assert.equal(nombreHoja("x".repeat(60)).length, 31);
  assert.equal(nombreHoja("***"), "Hoja");
  assert.equal(nombreArchivoExcel("En producción", new Date("2026-10-28T15:00:00Z")), "ecomfive-en-producci-n-2026-10-28.xlsx");
  assert.equal(nombreArchivoExcel("pagos", new Date("2026-10-28T15:00:00Z")), "ecomfive-pagos-2026-10-28.xlsx");
});
