import assert from "node:assert/strict";
import { test } from "node:test";
import { costoImagen, costoTexto } from "./precios";

test("el costo de texto: tokens de entrada y salida según el modelo, más las búsquedas", () => {
  // gpt-4.1-mini: 0,40 y 1,60 dólares por millón.
  assert.equal(costoTexto("gpt-4.1-mini", { tokensEntrada: 10_000, tokensSalida: 2_000, busquedas: 0 }), 0.0072);
  assert.equal(costoTexto("gpt-4.1-mini", { tokensEntrada: 10_000, tokensSalida: 2_000, busquedas: 3 }), 0.0372);
  // El modelo más específico gana: mini no se cobra como gpt-4.1.
  assert.ok(costoTexto("gpt-4.1", { tokensEntrada: 1e6, tokensSalida: 0, busquedas: 0 }) > costoTexto("gpt-4.1-mini", { tokensEntrada: 1e6, tokensSalida: 0, busquedas: 0 }));
  assert.equal(costoTexto("gpt-5", { tokensEntrada: 1e6, tokensSalida: 1e6, busquedas: 0 }), 11.25);
});

test("un modelo desconocido se cobra como uno caro; Claude se reconoce por su familia", () => {
  assert.equal(costoTexto("modelo-nuevo", { tokensEntrada: 1e6, tokensSalida: 0, busquedas: 0 }), 2.5);
  assert.equal(costoTexto("claude-sonnet-5-5", { tokensEntrada: 1e6, tokensSalida: 1e6, busquedas: 0 }), 18);
});

test("el costo de una imagen de Gemini: por modelo, o el precio que se fije", () => {
  assert.equal(costoImagen("gemini-nano-banana-2.1"), 0.034);
  assert.equal(costoImagen("gemini-3-pro-image-preview"), 0.134);
  assert.equal(costoImagen("gemini-nano-banana-2.1", "0.05"), 0.05);
  assert.equal(costoImagen("gemini-nano-banana-2.1", "mal"), 0.034);
});
