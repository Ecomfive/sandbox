import assert from "node:assert/strict";
import test from "node:test";
import { MODULO_UNIR_PRODUCTOS, puedeUnirProductos } from "./unir-productos";

const persona = (modulos: string[], soloLectura: string[] = []) => ({ modulos, modulosSoloLectura: soloLectura });

test("un administrador con edición en Producto puede unir; con Producto en solo lectura, no", () => {
  assert.equal(puedeUnirProductos(persona(["producto", "usuarios"])), true);
  assert.equal(puedeUnirProductos(persona(["producto", "usuarios"], ["producto"])), false);
  // Un administrador de solo lectura en Usuarios y roles no administra.
  assert.equal(puedeUnirProductos(persona(["producto", "usuarios"], ["usuarios"])), false);
});

test("quien tiene el módulo «Unir productos» con edición puede unir, sin ser administrador", () => {
  assert.equal(puedeUnirProductos(persona(["producto", MODULO_UNIR_PRODUCTOS])), true);
  // Aunque Producto lo tenga solo en lectura: el permiso propio es el que autoriza.
  assert.equal(puedeUnirProductos(persona(["producto", MODULO_UNIR_PRODUCTOS], ["producto"])), true);
});

test("sin el módulo, con el módulo en solo lectura o sin poder abrir Producto, no puede unir", () => {
  assert.equal(puedeUnirProductos(persona(["producto"])), false);
  assert.equal(puedeUnirProductos(persona(["producto", MODULO_UNIR_PRODUCTOS], [MODULO_UNIR_PRODUCTOS])), false);
  assert.equal(puedeUnirProductos(persona([MODULO_UNIR_PRODUCTOS])), false);
  assert.equal(puedeUnirProductos(persona([])), false);
});
