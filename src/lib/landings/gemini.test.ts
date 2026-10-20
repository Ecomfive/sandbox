import assert from "node:assert/strict";
import test from "node:test";
import { armarPromptImagen, cuerpoPedido, extraerImagen, mensajeError } from "./gemini";

const B64 = "A".repeat(200);

test("armarPromptImagen: producto, espacio, referencias, notas y sin textos sobre la imagen", () => {
  const p = armarPromptImagen({ espacio: "en_uso", instruccion: "Una mujer usándola en su sala", nombre: "Lámpara Luna", angulo: "regalo", notas: "Sin promesas médicas", referencias: 2 });
  assert.match(p, /Lámpara Luna/);
  assert.match(p, /En uso/);
  assert.match(p, /Para regalar/);
  assert.match(p, /Una mujer usándola en su sala/);
  assert.match(p, /2 imágenes adjuntas son fotos reales/);
  assert.match(p, /Sin promesas médicas/);
  assert.match(p, /Sin textos/);
  // Sin referencias no habla de fotos adjuntas; sin instrucción usa la del espacio.
  const q = armarPromptImagen({ espacio: "portada", instruccion: "  ", nombre: "X", angulo: "hogar", notas: null, referencias: 0 });
  assert.doesNotMatch(q, /adjunta/);
  assert.match(q, /Foto de producto cuadrada/);
});

test("cuerpoPedido: texto primero, luego las fotos, y el formato de la imagen", () => {
  const c = cuerpoPedido("m", "hola", [{ mime: "image/png", base64: "xx" }], "4:5");
  assert.equal(c.model, "m");
  assert.deepEqual(c.input, [
    { type: "text", text: "hola" },
    { type: "image", mime_type: "image/png", data: "xx" },
  ]);
  assert.deepEqual(c.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: "1K" });
});

test("extraerImagen: toma la última imagen (las de pensamiento van antes), en cualquiera de los dos formatos", () => {
  const interaccion = {
    steps: [
      { type: "thought", content: [{ type: "image", mime_type: "image/png", data: "B".repeat(200) }] },
      { type: "model_output", content: [{ type: "text", text: "Listo" }, { type: "image", mime_type: "image/jpeg", data: B64 }] },
    ],
  };
  assert.deepEqual(extraerImagen(interaccion), { base64: B64, mime: "image/jpeg" });
  const generate = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: B64 } }] } }] };
  assert.deepEqual(extraerImagen(generate), { base64: B64, mime: "image/png" });
});

test("extraerImagen: sin imagen explica por qué; con error de la API, en palabras simples", () => {
  const r = extraerImagen({ steps: [{ content: [{ type: "text", text: "No puedo generar esa imagen." }] }] });
  assert.ok("error" in r && r.error.includes("No puedo generar esa imagen."));
  const e = extraerImagen({ error: { code: 429, message: "Resource exhausted" } });
  assert.ok("error" in e && e.error.includes("límite"));
  assert.match(mensajeError(403, ""), /clave/);
});
