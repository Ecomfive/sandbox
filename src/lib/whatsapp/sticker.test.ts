import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { aSticker, LADO_STICKER, MAX_STICKER_QUIETO } from "./sticker";

describe("stickers", () => {
  it("una imagen cualquiera sale como WebP de 512 × 512 que cabe en 100 KB", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const r = await aSticker(new Uint8Array(png));
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.animado, false);
    assert.equal(detectarImagen(r.bytes.slice(0, 64))?.tipo, "image/webp");
    assert.ok(r.bytes.length <= MAX_STICKER_QUIETO);
    const meta = await sharp(r.bytes).metadata();
    assert.equal(meta.width, LADO_STICKER);
    assert.equal(meta.height, LADO_STICKER);
  });

  it("una imagen con ruido (que pesa mucho) baja de calidad hasta caber", async () => {
    const ancho = 700;
    const crudo = Buffer.alloc(ancho * ancho * 3);
    for (let i = 0; i < crudo.length; i++) crudo[i] = (i * 7919 + (i >> 3) * 31) & 255;
    const jpg = await sharp(crudo, { raw: { width: ancho, height: ancho, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const r = await aSticker(new Uint8Array(jpg));
    if ("error" in r) assert.match(r.error, /pesa demasiado/);
    else assert.ok(r.bytes.length <= MAX_STICKER_QUIETO);
  });

  it("lo que no es una imagen da un motivo", async () => {
    const r = await aSticker(new TextEncoder().encode("esto no es una imagen"));
    assert.ok("error" in r);
  });
});
