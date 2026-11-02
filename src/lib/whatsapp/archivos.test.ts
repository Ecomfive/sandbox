import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectarArchivoWhatsapp, LIMITE_ENVIO, motivoDeRechazoEnvio } from "./archivos";

const bytes = (...b: number[]) => Uint8Array.from(b);
const texto = (t: string, largo = 64) => {
  const a = new Uint8Array(largo);
  for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i);
  return a;
};
const con = (base: Uint8Array, desde: number, t: string) => {
  const a = Uint8Array.from(base);
  for (let i = 0; i < t.length; i++) a[desde + i] = t.charCodeAt(i);
  return a;
};

describe("archivos para WhatsApp", () => {
  it("fotos: solo JPG y PNG", () => {
    assert.deepEqual(detectarArchivoWhatsapp(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0), "a.jpg"), { tipo: "imagen", mime: "image/jpeg" });
    assert.deepEqual(detectarArchivoWhatsapp(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "a.png"), { tipo: "imagen", mime: "image/png" });
    const webp = con(con(new Uint8Array(64), 0, "RIFF"), 8, "WEBP");
    assert.match((detectarArchivoWhatsapp(webp, "a.webp") as { error: string }).error, /JPG o PNG/);
  });

  it("el contenido manda, no el nombre", () => {
    // Un ejecutable llamado .jpg no es una foto.
    assert.ok("error" in detectarArchivoWhatsapp(bytes(0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0), "virus.jpg"));
    assert.ok("error" in detectarArchivoWhatsapp(texto("<html>"), "foto.png"));
  });

  it("audios: OGG con Opus, MP3, M4A, AMR", () => {
    assert.deepEqual(detectarArchivoWhatsapp(con(texto("OggS"), 28, "OpusHead"), "nota.ogg"), { tipo: "audio", mime: "audio/ogg" });
    assert.match((detectarArchivoWhatsapp(con(texto("OggS"), 28, "vorbis"), "nota.ogg") as { error: string }).error, /Opus/);
    assert.deepEqual(detectarArchivoWhatsapp(texto("ID3"), "a.mp3"), { tipo: "audio", mime: "audio/mpeg" });
    assert.deepEqual(detectarArchivoWhatsapp(bytes(0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0), "a.mp3"), { tipo: "audio", mime: "audio/mpeg" });
    assert.deepEqual(detectarArchivoWhatsapp(texto("#!AMR\n"), "a.amr"), { tipo: "audio", mime: "audio/amr" });
    assert.deepEqual(detectarArchivoWhatsapp(con(con(new Uint8Array(64), 4, "ftyp"), 8, "M4A "), "a.m4a"), { tipo: "audio", mime: "audio/mp4" });
  });

  it("video MP4 y un M4A por su extensión", () => {
    const mp4 = con(con(new Uint8Array(64), 4, "ftyp"), 8, "isom");
    assert.deepEqual(detectarArchivoWhatsapp(mp4, "v.mp4"), { tipo: "video", mime: "video/mp4" });
    assert.deepEqual(detectarArchivoWhatsapp(mp4, "audio.m4a"), { tipo: "audio", mime: "audio/mp4" });
  });

  it("documentos: PDF, Office y texto", () => {
    assert.deepEqual(detectarArchivoWhatsapp(texto("%PDF-1.7"), "c.pdf"), { tipo: "documento", mime: "application/pdf" });
    const zip = con(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), 4, "xl/workbook.xml");
    assert.equal((detectarArchivoWhatsapp(zip, "c.xlsx") as { mime: string }).mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const plano = new TextEncoder().encode("hola mundo, esto es un texto");
    assert.deepEqual(detectarArchivoWhatsapp(plano, "n.txt"), { tipo: "documento", mime: "text/plain" });
    assert.ok("error" in detectarArchivoWhatsapp(plano, "n.exe"));
    // Un binario con extensión .txt no es texto.
    assert.ok("error" in detectarArchivoWhatsapp(texto("hola"), "n.txt"));
  });

  it("revisa el tamaño de cada clase y los archivos vacíos", () => {
    const jpg = new Uint8Array(LIMITE_ENVIO.imagen + 1);
    jpg.set([0xff, 0xd8, 0xff, 0xe0]);
    assert.match((detectarArchivoWhatsapp(jpg, "g.jpg") as { error: string }).error, /pesa más de 5 MB/);
    assert.ok("error" in detectarArchivoWhatsapp(new Uint8Array(0), "a.jpg"));
  });

  it("el aviso rápido antes de subir", () => {
    assert.equal(motivoDeRechazoEnvio({ tamano: 100, nombre: "a.jpg", tipo: "image/jpeg" }), null);
    assert.match(motivoDeRechazoEnvio({ tamano: 100, nombre: "a.webp", tipo: "image/webp" }) ?? "", /JPG o PNG/);
    assert.match(motivoDeRechazoEnvio({ tamano: 20 * 1024 * 1024, nombre: "a.mp4", tipo: "video/mp4" }) ?? "", /16 MB/);
  });
});
