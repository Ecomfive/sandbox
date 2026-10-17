import assert from "node:assert/strict";
import test from "node:test";
import { esSoloImagen } from "./guardar";

test("esSoloImagen: un archivo guardado como imagen puede mejorarse con un video; un video o nada, no", () => {
  assert.equal(esSoloImagen("01a1477b-3916/imagen.jpg"), true);
  assert.equal(esSoloImagen("01a1477b-3916/imagen.webp"), true);
  assert.equal(esSoloImagen("01a1477b-3916/video.mp4"), false);
  assert.equal(esSoloImagen(null), false);
  assert.equal(esSoloImagen(""), false);
});
