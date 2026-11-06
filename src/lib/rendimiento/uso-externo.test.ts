import assert from "node:assert/strict";
import test from "node:test";
import { limpiarSeccion, revisarLatidoExterno } from "./uso-externo";

test("la sección se queda solo con palabras y dos partes", () => {
  assert.equal(limpiarSeccion("dashboard/orders"), "dashboard/orders");
  assert.equal(limpiarSeccion("Dashboard/Orders/lista"), "dashboard/orders");
});

test("un número, un id o algo raro no entra en la sección", () => {
  assert.equal(limpiarSeccion("orders/48213"), "orders");
  assert.equal(limpiarSeccion("orders/a3f9c2d1-77"), "orders");
  assert.equal(limpiarSeccion("cliente@correo.com/orders"), "orders");
  assert.equal(limpiarSeccion(42), "");
  assert.equal(limpiarSeccion(null), "");
});

test("un minuto trae plataforma y sección limpia", () => {
  assert.deepEqual(revisarLatidoExterno({ plataforma: "dropi", seccion: "orders/123", version: "0.1.0" }), { tipo: "minuto", plataforma: "dropi", seccion: "orders", version: "0.1.0" });
});

test("sin plataforma es solo la señal de que la extensión está puesta", () => {
  assert.deepEqual(revisarLatidoExterno({ version: "0.1.0" }), { tipo: "senal", version: "0.1.0" });
});

test("una plataforma desconocida o un cuerpo raro se rechaza", () => {
  assert.equal(revisarLatidoExterno({ plataforma: "facebook", seccion: "" }), null);
  assert.equal(revisarLatidoExterno("hola"), null);
  assert.equal(revisarLatidoExterno(null), null);
});

test("una versión rara no se guarda", () => {
  assert.deepEqual(revisarLatidoExterno({ version: "<script>" }), { tipo: "senal", version: null });
});
