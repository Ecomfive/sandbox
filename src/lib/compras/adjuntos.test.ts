import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectarAdjunto, MAX_BYTES_ADJUNTO, MAX_BYTES_VIDEO, motivoDeRechazo, nombreSeguro } from "./adjuntos";

const bytes = (...partes: (number | string)[]) => Uint8Array.from(partes.flatMap((p) => (typeof p === "number" ? [p] : [...p].map((c) => c.charCodeAt(0)))));

describe("motivoDeRechazo", () => {
  it("acepta Excel, Word, CSV por su extensión aunque el navegador no diga el tipo", () => {
    assert.equal(motivoDeRechazo({ tipo: "", tamano: 500, nombre: "cotizacion.xlsx" }), null);
    assert.equal(motivoDeRechazo({ tipo: "", tamano: 500, nombre: "lista.csv" }), null);
    assert.match(motivoDeRechazo({ tipo: "application/zip", tamano: 500, nombre: "cosas.zip" }) ?? "", /imágenes/);
  });
  it("acepta imágenes y PDF de un peso razonable", () => {
    assert.equal(motivoDeRechazo({ tipo: "image/png", tamano: 2_000_000 }), null);
    assert.equal(motivoDeRechazo({ tipo: "application/pdf", tamano: 500, nombre: "pago.pdf" }), null);
  });
  it("rechaza SVG, HTML y lo que no es imagen ni PDF", () => {
    assert.match(motivoDeRechazo({ tipo: "image/svg+xml", tamano: 100 }) ?? "", /imágenes/);
    assert.match(motivoDeRechazo({ tipo: "text/html", tamano: 100 }) ?? "", /imágenes/);
  });
  it("rechaza lo vacío y lo muy pesado", () => {
    assert.match(motivoDeRechazo({ tipo: "image/png", tamano: 0 }) ?? "", /vacío/);
    assert.match(motivoDeRechazo({ tipo: "image/png", tamano: MAX_BYTES_ADJUNTO + 1 }) ?? "", /pesa más/);
  });
});

describe("videos", () => {
  const mp4 = bytes(0, 0, 0, 0x20, "ftypisom", 0, 0, 2, 0);
  const mov = bytes(0, 0, 0, 0x14, "ftypqt  ", 0, 0, 0, 0);
  const heic = bytes(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0);
  const webm = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, "webm");
  it("solo se aceptan donde el módulo los pide", () => {
    assert.equal(detectarAdjunto(mp4, "video.mp4"), null);
    assert.match(motivoDeRechazo({ tipo: "video/mp4", tamano: 1000, nombre: "video.mp4" }) ?? "", /imágenes/);
    assert.equal(motivoDeRechazo({ tipo: "video/mp4", tamano: 1000, nombre: "video.mp4" }, { videos: true }), null);
  });
  it("reconoce MP4, MOV y WebM por su contenido, y no confunde una foto HEIC", () => {
    assert.deepEqual(detectarAdjunto(mp4, "x", { videos: true }), { clase: "video", tipo: "video/mp4", extension: "mp4" });
    assert.deepEqual(detectarAdjunto(mov, "x", { videos: true }), { clase: "video", tipo: "video/quicktime", extension: "mov" });
    assert.deepEqual(detectarAdjunto(webm, "x", { videos: true }), { clase: "video", tipo: "video/webm", extension: "webm" });
    assert.equal(detectarAdjunto(heic, "foto.heic", { videos: true }), null);
  });
  it("un video puede pesar más que un documento, hasta su propio máximo", () => {
    assert.equal(motivoDeRechazo({ tipo: "video/quicktime", tamano: MAX_BYTES_ADJUNTO + 1, nombre: "IMG_1.MOV" }, { videos: true }), null);
    assert.match(motivoDeRechazo({ tipo: "video/mp4", tamano: MAX_BYTES_VIDEO + 1, nombre: "v.mp4" }, { videos: true }) ?? "", /video pesa más/);
    assert.match(motivoDeRechazo({ tipo: "application/pdf", tamano: MAX_BYTES_ADJUNTO + 1, nombre: "a.pdf" }, { videos: true }) ?? "", /archivo pesa más/);
  });
});

describe("detectarAdjunto", () => {
  it("reconoce imágenes por su firma, sin mirar el nombre", () => {
    assert.deepEqual(detectarAdjunto(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), { clase: "foto", tipo: "image/jpeg", extension: "jpg" });
    assert.deepEqual(detectarAdjunto(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), { clase: "foto", tipo: "image/png", extension: "png" });
  });
  it("reconoce un PDF", () => {
    assert.deepEqual(detectarAdjunto(bytes("%PDF-1.7 resto")), { clase: "documento", tipo: "application/pdf", extension: "pdf" });
  });
  it("reconoce Excel, Word y PowerPoint modernos por su carpeta interna", () => {
    assert.equal(detectarAdjunto(bytes(0x50, 0x4b, 0x03, 0x04, "....[Content_Types].xml....xl/workbook.xml"), "cotizacion.xlsx")?.extension, "xlsx");
    assert.equal(detectarAdjunto(bytes(0x50, 0x4b, 0x03, 0x04, "....word/document.xml"), "carta.docx")?.extension, "docx");
    assert.equal(detectarAdjunto(bytes(0x50, 0x4b, 0x03, 0x04, "....ppt/presentation.xml"), "x.pptx")?.extension, "pptx");
  });
  it("un ZIP cualquiera no pasa aunque se llame .xlsx", () => {
    assert.equal(detectarAdjunto(bytes(0x50, 0x4b, 0x03, 0x04, "programa.exe"), "falso.xlsx"), null);
  });
  it("un Excel o Word viejo según su extensión", () => {
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    assert.equal(detectarAdjunto(bytes(...ole, 0, 0), "viejo.xls")?.extension, "xls");
    assert.equal(detectarAdjunto(bytes(...ole, 0, 0), "raro.bin"), null);
  });
  it("CSV y texto, siempre como texto plano; una página web con nombre .csv no pasa", () => {
    assert.deepEqual(detectarAdjunto(bytes("sku,cantidad\nA,10\n"), "lista.csv"), { clase: "documento", tipo: "text/plain; charset=utf-8", extension: "csv" });
    assert.equal(detectarAdjunto(bytes("<html><script>alert(1)</script>"), "truco.csv"), null);
    assert.equal(detectarAdjunto(bytes("hola", 0, "mundo"), "binario.txt"), null);
  });
  it("rechaza un HTML o un SVG que se hace pasar por imagen o PDF", () => {
    assert.equal(detectarAdjunto(bytes("<html><script>alert(1)</script></html>")), null);
    assert.equal(detectarAdjunto(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectarAdjunto(new Uint8Array(0)), null);
  });
});

describe("nombreSeguro", () => {
  it("quita carpetas, acentos y caracteres raros", () => {
    assert.equal(nombreSeguro("../../pago de Octubre (final).png"), "pago-de-Octubre-final-.png");
    assert.equal(nombreSeguro("captura 1.jpg"), "captura-1.jpg");
  });
  it("nunca queda vacío ni demasiado largo", () => {
    assert.equal(nombreSeguro("???"), "archivo");
    assert.equal(nombreSeguro("").length > 0, true);
    assert.ok(nombreSeguro("a".repeat(300)).length <= 100);
  });
});
