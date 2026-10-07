import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectarAdjunto, MAX_BYTES_ADJUNTO, motivoDeRechazo, nombreSeguro } from "./adjuntos";

const bytes = (...partes: (number | string)[]) => Uint8Array.from(partes.flatMap((p) => (typeof p === "number" ? [p] : [...p].map((c) => c.charCodeAt(0)))));

describe("motivoDeRechazo", () => {
  it("acepta imágenes y PDF de un peso razonable", () => {
    assert.equal(motivoDeRechazo({ tipo: "image/png", tamano: 2_000_000 }), null);
    assert.equal(motivoDeRechazo({ tipo: "application/pdf", tamano: 500 }), null);
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

describe("detectarAdjunto", () => {
  it("reconoce imágenes por su firma, sin mirar el nombre", () => {
    assert.deepEqual(detectarAdjunto(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), { clase: "foto", tipo: "image/jpeg", extension: "jpg" });
    assert.deepEqual(detectarAdjunto(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), { clase: "foto", tipo: "image/png", extension: "png" });
  });
  it("reconoce un PDF", () => {
    assert.deepEqual(detectarAdjunto(bytes("%PDF-1.7 resto")), { clase: "documento", tipo: "application/pdf", extension: "pdf" });
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
