import assert from "node:assert/strict";
import test from "node:test";
import { esConfirmada, etiquetasSugeridas, limpiarEtiqueta, planCambio, textoCambio } from "./etiquetas-shopify";

test("limpiar una etiqueta escrita a mano", () => {
  assert.equal(limpiarEtiqueta("  Pendiente  "), "Pendiente");
  assert.equal(limpiarEtiqueta("Modificar,  Dirección"), "Modificar Dirección");
  assert.equal(limpiarEtiqueta(""), null);
  assert.equal(limpiarEtiqueta("x".repeat(41)), null);
});

test("el plan solo agrega lo que falta y quita lo que hay", () => {
  const p = planCambio(["CIUDAD", "Pendiente", "easysell_cod_form"], ["confirmada", "ciudad", "Confirmada"], ["pendiente", "No existe"]);
  assert.deepEqual(p.agregar, ["confirmada"]);
  assert.deepEqual(p.quitar, ["Pendiente"]);
  assert.deepEqual(p.final, ["CIUDAD", "easysell_cod_form", "confirmada"]);
  // Agregar y quitar la misma: no se agrega.
  assert.deepEqual(planCambio(["A"], ["B"], ["b"]).agregar, []);
});

test("confirmada y texto del historial", () => {
  assert.equal(esConfirmada(["CIUDAD", "Confirmada"]), true);
  assert.equal(esConfirmada(["confirmado"]), true);
  assert.equal(esConfirmada(["Por confirmar"]), false);
  assert.equal(textoCambio(["Confirmada"], ["Pendiente"]), "Etiquetas en Shopify: agregó «Confirmada» y quitó «Pendiente»");
  assert.equal(textoCambio([], ["A", "B"]), "Etiquetas en Shopify: quitó «A», «B»");
});

test("sugeridas: las más usadas, sin las de apps ni las que ya tiene", () => {
  const usadas = [["CIUDAD", "Confirmada", "releasit_cod_form"], ["Confirmada", "Pendiente"], ["confirmada", "chatbot"], ["ANULADO/VERIFICADO"]];
  assert.deepEqual(etiquetasSugeridas(usadas, ["ciudad"]), ["Confirmada", "ANULADO/VERIFICADO", "Pendiente"]);
  assert.deepEqual(etiquetasSugeridas(usadas, [], 1), ["Confirmada"]);
});
