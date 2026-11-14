import assert from "node:assert/strict";
import test from "node:test";
import { autorizadaParaSalidaManual, MODULO_SALIDA_MANUAL } from "./salida-manual";

const persona = (modulos: string[], soloLectura: string[] = []) => ({ modulos, modulosSoloLectura: soloLectura });

test("un administrador está autorizado; uno de solo lectura en Usuarios y roles, no", () => {
  assert.equal(autorizadaParaSalidaManual(persona(["inventario", "usuarios"])), true);
  assert.equal(autorizadaParaSalidaManual(persona(["inventario", "usuarios"], ["usuarios"])), false);
});

test("quien tiene el módulo «Salida a mano» con edición está autorizada, sin ser administradora", () => {
  assert.equal(autorizadaParaSalidaManual(persona(["inventario", MODULO_SALIDA_MANUAL])), true);
});

test("sin el módulo o con el módulo en solo lectura, no está autorizada", () => {
  assert.equal(autorizadaParaSalidaManual(persona(["inventario"])), false);
  assert.equal(autorizadaParaSalidaManual(persona(["inventario", MODULO_SALIDA_MANUAL], [MODULO_SALIDA_MANUAL])), false);
  assert.equal(autorizadaParaSalidaManual(persona([])), false);
});
