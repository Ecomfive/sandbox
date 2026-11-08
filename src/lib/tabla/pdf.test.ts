import { test } from "node:test";
import assert from "node:assert/strict";
import { celdaPdf, columnasPdf, filasAPdf, partirEnLineas, textoPdf } from "./pdf";
import type { DefTabla } from "./motor";

interface F {
  n: number;
  nombre: string;
  precio: number | null;
  fecha: string;
  nota: string;
}

const DEF: DefTabla<F> = {
  clave: "prueba",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (f) => f.nota },
  ],
  csvAntes: [{ etiqueta: "N.º", valor: (f) => f.n }],
};
const FILAS: F[] = [
  { n: 1, nombre: "Corrector de postura «Pro» → talla M", precio: 1234.5, fecha: "2026-11-08", nota: "" },
  { n: 2, nombre: "Crema ₡ ñandú", precio: null, fecha: "2026-10-01T10:00:00Z", nota: "" },
];

test("PDF de una tabla: columnas, celdas y texto que se puede dibujar", async () => {
  assert.equal(textoPdf("a → b … ₡5 “x”"), 'a -> b ... CRC 5 "x"');
  assert.equal(textoPdf("ñandú «Pro»"), "ñandú «Pro»", "Latin-1 se queda");
  assert.equal(celdaPdf(1234.5, "numero"), (1234.5).toLocaleString("es-PA", { maximumFractionDigits: 2 }));
  assert.equal(celdaPdf("2026-11-08", "fecha"), "08/11/2026");
  assert.equal(celdaPdf(null, "texto"), "");
  assert.deepEqual(columnasPdf(DEF, FILAS).map((c) => c.etiqueta), ["N.º", "Nombre", "Precio", "Fecha"], "sin pdf: las que traen algo (la Nota va vacía)");
  assert.deepEqual(columnasPdf({ ...DEF, pdf: ["Precio", "No existe", "N.º"] }, FILAS).map((c) => c.etiqueta), ["Precio", "N.º"], "con pdf: esas, en ese orden");
  const medir = (t: string) => t.length;
  assert.deepEqual(partirEnLineas("uno dos tres", medir, 7), ["uno dos", "tres"]);
  assert.deepEqual(partirEnLineas("a b c d e f g h", medir, 3, 2), ["a b", "c..."], "lo que no cabe termina en ...");
  assert.deepEqual(partirEnLineas("ESPUMA/DEPILACION/PACK/2", medir, 18), ["ESPUMA/DEPILACION/", "PACK/2"], "un SKU se corta en la /");
  assert.equal(textoPdf("Salud › Cuidado"), "Salud > Cuidado");
  const bytes = await filasAPdf(DEF, Array.from({ length: 120 }, (_, i) => ({ ...FILAS[i % 2], n: i + 1 })), "Gestión de IDs Dropi");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.length > 1000);
});
