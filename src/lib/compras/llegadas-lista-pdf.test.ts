import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import type { FilaLlegada } from "./llegadas-avisos";
import { fechaDeLlegada, FILAS_CON_FOTOS, FILAS_SIN_FOTOS, hojasDeLista, listaLlegadasAPdf, nombreArchivoLista, totalDeHoja } from "./llegadas-lista-pdf";

const fila = (i: number, o: Partial<FilaLlegada> = {}): FilaLlegada => ({
  compraId: `c${i}`,
  orden: `OC-${String(900 + i).padStart(4, "0")}`,
  codigo: null,
  productos: [{ codigo: "HAPPY/CLEANER/NEWELLME", nombre: "Suplemento Happy Cleaner 14 Días" }],
  unidades: 100 + i,
  cajas: 2,
  etiquetasRutas: [],
  segundoPago: null,
  pagadoEn: null,
  montoPagado: null,
  pagadoPor: null,
  etapa: "arribo_mercancia",
  ...o,
});

test("las hojas: 32 filas sin fotos y siempre al menos una", () => {
  assert.equal(hojasDeLista(0, false), 1);
  assert.equal(hojasDeLista(FILAS_SIN_FOTOS, false), 1);
  assert.equal(hojasDeLista(FILAS_SIN_FOTOS + 1, false), 2);
  assert.equal(hojasDeLista(FILAS_CON_FOTOS + 1, true), 2);
});

test("el total de una hoja suma unidades y cajas, y una compra sin dato cuenta cero", () => {
  assert.deepEqual(totalDeHoja([{ unidades: 10, cajas: 2 }, { unidades: null, cajas: null }, { unidades: 5, cajas: 1 }]), { unidades: 15, cajas: 3 });
});

test("el PDF sale con las dos versiones, vacío y con muchas filas", async () => {
  const sin = await listaLlegadasAPdf([fila(1), fila(2, { cajas: null })], { conFotos: false });
  assert.equal(Buffer.from(sin.slice(0, 5)).toString(), "%PDF-");
  assert.equal((await PDFDocument.load(sin)).getPageCount(), 1);
  const muchas = await listaLlegadasAPdf(Array.from({ length: 70 }, (_, i) => fila(i)), { conFotos: false });
  assert.equal((await PDFDocument.load(muchas)).getPageCount(), 3);
  const conFotos = await listaLlegadasAPdf(Array.from({ length: 30 }, (_, i) => fila(i)), { conFotos: true });
  assert.equal((await PDFDocument.load(conFotos)).getPageCount(), 3);
  const vacia = await listaLlegadasAPdf([], { conFotos: true });
  assert.equal((await PDFDocument.load(vacia)).getPageCount(), 1);
});

test("una foto que no se puede traer no rompe el PDF con fotos", async () => {
  const bytes = await listaLlegadasAPdf([fila(1, { foto: "https://x/f.jpg" })], { conFotos: true, cargar: async () => null });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
});

test("el nombre del archivo dice si lleva fotos", () => {
  assert.equal(nombreArchivoLista(new Date("2026-11-24T12:00:00Z"), false), "lista-llegadas-puerto-2026-11-24.pdf");
  assert.equal(nombreArchivoLista(new Date("2026-11-24T12:00:00Z"), true), "lista-llegadas-puerto-con-fotos-2026-11-24.pdf");
});

test("la fecha de llegada: un día, un rango o en blanco", () => {
  assert.equal(fechaDeLlegada([{ llegadaEn: "2026-11-24T15:00:00Z" }, { llegadaEn: "2026-11-24T20:00:00Z" }]), "24/11/2026");
  assert.equal(fechaDeLlegada([{ llegadaEn: "2026-11-26T15:00:00Z" }, { llegadaEn: "2026-11-24T20:00:00Z" }]), "24/11/2026 - 26/11/2026");
  assert.equal(fechaDeLlegada([{}]), "");
});

test("el nombre del archivo de un lote lleva la hora de Panamá", () => {
  assert.equal(nombreArchivoLista(new Date("2026-11-24T20:00:00Z"), false, "2026-11-24T12:14:10Z"), "lista-llegadas-puerto-2026-11-24-0714.pdf");
  assert.equal(nombreArchivoLista(new Date("2026-11-24T20:00:00Z"), true, "2026-11-24T12:14:10Z"), "lista-llegadas-puerto-con-fotos-2026-11-24-0714.pdf");
});
