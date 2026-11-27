import assert from "node:assert/strict";
import test from "node:test";
import { MODULO_ANULAR_REMISION, MODULO_CORREGIR_REMISION, puedeAnularSinAutorizacion, puedeCorregirSinAutorizacion } from "./anular-remision";

const persona = (modulos: string[], soloLectura: string[] = []) => ({ modulos, modulosSoloLectura: soloLectura });

test("quien tiene el módulo con edición puede anular sin autorización", () => {
  assert.equal(puedeAnularSinAutorizacion(persona(["inventario", MODULO_ANULAR_REMISION])), true);
});

test("sin el módulo, con él en solo lectura o siendo solo administradora, no", () => {
  assert.equal(puedeAnularSinAutorizacion(persona(["inventario"])), false);
  assert.equal(puedeAnularSinAutorizacion(persona(["inventario", MODULO_ANULAR_REMISION], [MODULO_ANULAR_REMISION])), false);
  assert.equal(puedeAnularSinAutorizacion(persona(["inventario", "usuarios"])), false);
});

test("corregir lo recibido sin autorización: solo con su propio módulo en edición (27 nov 2026)", () => {
  assert.equal(puedeCorregirSinAutorizacion({ modulos: [MODULO_CORREGIR_REMISION], modulosSoloLectura: [] }), true);
  assert.equal(puedeCorregirSinAutorizacion({ modulos: [MODULO_CORREGIR_REMISION], modulosSoloLectura: [MODULO_CORREGIR_REMISION] }), false);
  // Anular sin autorización no da corregir.
  assert.equal(puedeCorregirSinAutorizacion({ modulos: [MODULO_ANULAR_REMISION], modulosSoloLectura: [] }), false);
});
