import assert from "node:assert/strict";
import test from "node:test";
import { quitaLoRecibidoAlReabrir } from "./estados";

test("reabrir un retiro conciliado le quita lo recibido; los demás cambios de estado no", () => {
  assert.equal(quitaLoRecibidoAlReabrir("cerrado", "novedad"), true);
  assert.equal(quitaLoRecibidoAlReabrir("cerrado", "abierto"), true);
  assert.equal(quitaLoRecibidoAlReabrir("novedad_resuelta", "abierto"), true);
  assert.equal(quitaLoRecibidoAlReabrir("abierto", "novedad"), false);
  assert.equal(quitaLoRecibidoAlReabrir("novedad", "cerrado"), false);
  assert.equal(quitaLoRecibidoAlReabrir("cerrado", "cerrado"), false);
});
