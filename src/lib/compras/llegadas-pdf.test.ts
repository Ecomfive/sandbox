import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import type { FilaLlegada } from "./llegadas-avisos";
import { llegadasAPdf, nombreArchivoLlegadas } from "./llegadas-pdf";

const fila = (i: number, o: Partial<FilaLlegada> = {}): FilaLlegada => ({
  compraId: `c${i}`,
  orden: `OC-${String(900 + i).padStart(4, "0")}`,
  codigo: `ECOM01-04${i}`,
  productos: [{ codigo: "HAPPY/CLEANER/NEWELLME", nombre: "Suplemento Happy Cleaner 14 Días" }],
  unidades: 1000 + i,
  cajas: 8,
  etiquetasRutas: [],
  segundoPago: null,
  pagadoEn: null,
  montoPagado: null,
  pagadoPor: null,
  etapa: "arribo_mercancia",
  ...o,
});

test("el PDF de llegadas sale sin imágenes si no hay cómo traerlas", async () => {
  const bytes = await llegadasAPdf([fila(1), fila(2, { cajas: null })], {}, "Últimos 7 días", new Date("2026-11-18T12:00:00Z"));
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});

test("muchas llegadas pasan a otra hoja y una lista vacía también sale", async () => {
  const muchas = await llegadasAPdf(Array.from({ length: 40 }, (_, i) => fila(i)), {}, "Hoy");
  assert.ok((await PDFDocument.load(muchas)).getPageCount() > 1);
  const vacia = await llegadasAPdf([], {}, "Hoy");
  assert.equal((await PDFDocument.load(vacia)).getPageCount(), 1);
});

test("una imagen que no se puede traer no rompe el PDF", async () => {
  const bytes = await llegadasAPdf([fila(1, { foto: "https://x/foto.jpg", etiquetasRutas: ["a"] })], { c1: [{ url: "https://x/e.jpg" }] }, "Hoy", new Date(), async () => null);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
});

test("el archivo lleva el día", () => {
  assert.equal(nombreArchivoLlegadas(new Date("2026-11-18T12:00:00Z")), "llegadas-puerto-2026-11-18.pdf");
});
