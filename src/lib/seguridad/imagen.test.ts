import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarImagen } from "./imagen";

const bytes = (...v: (number | string)[]) => Uint8Array.from(v.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

test("reconoce JPEG, PNG, GIF y WebP por su firma", () => {
  assert.deepEqual(detectarImagen(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), { tipo: "image/jpeg", extension: "jpg" });
  assert.deepEqual(detectarImagen(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)), { tipo: "image/png", extension: "png" });
  assert.deepEqual(detectarImagen(bytes("GIF89a", 0, 0)), { tipo: "image/gif", extension: "gif" });
  assert.deepEqual(detectarImagen(bytes("RIFF", 1, 2, 3, 4, "WEBP", "VP8 ")), { tipo: "image/webp", extension: "webp" });
});

test("rechaza un SVG, aunque se presente como imagen", () => {
  assert.equal(detectarImagen(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')), null);
});

test("rechaza HTML y otros archivos disfrazados de imagen", () => {
  assert.equal(detectarImagen(bytes("<html><script>alert(1)</script></html>")), null);
  assert.equal(detectarImagen(bytes("%PDF-1.4")), null);
  assert.equal(detectarImagen(bytes("MZ", 0x90, 0, 3)), null);
});

test("rechaza archivos vacíos o demasiado cortos", () => {
  assert.equal(detectarImagen(new Uint8Array(0)), null);
  assert.equal(detectarImagen(bytes(0xff, 0xd8)), null);
});
