import assert from "node:assert/strict";
import test from "node:test";
import { quitarNotaDelBot } from "./nota-bot";

test("la nota del bot se reconoce y la nota queda vacía", () => {
  assert.deepEqual(quitarNotaDelBot("Pedido #89311 - Venta por bot - WhatsApp +50764641958"), { coincide: true, notaNueva: "" });
  assert.deepEqual(quitarNotaDelBot("  PEDIDO #1 — Venta por Bot – WhatsApp 507 6464-1958 "), { coincide: true, notaNueva: "" });
  assert.deepEqual(quitarNotaDelBot("Pedido 89311 - Venta por bot - WhatsApp +50764641958\r\n"), { coincide: true, notaNueva: "" });
});

test("si la nota trae algo más que escribió una persona, eso se conserva", () => {
  assert.deepEqual(quitarNotaDelBot("Pedido #89311 - Venta por bot - WhatsApp +50764641958\nEntregar para el jueves 19/11"), { coincide: true, notaNueva: "Entregar para el jueves 19/11" });
  assert.deepEqual(quitarNotaDelBot("Entregar en la tarde\nPedido #5 - Venta por bot - WhatsApp +50760000000\nLlamar antes"), { coincide: true, notaNueva: "Entregar en la tarde\nLlamar antes" });
});

test("lo que no es exactamente la nota del bot no se toca", () => {
  for (const nota of [
    "",
    null,
    undefined,
    "Entregar para el jueves",
    "Pedido #89311 - Venta por bot",
    "Pedido #89311 - Venta por bot - WhatsApp +50764641958 y llamar antes de ir",
    "Pedido #89311 - Venta manual - WhatsApp +50764641958",
    "Mi pedido #89311 - Venta por bot - WhatsApp +50764641958",
  ]) {
    const r = quitarNotaDelBot(nota);
    assert.equal(r.coincide, false, String(nota));
    assert.equal(r.notaNueva, typeof nota === "string" ? nota : "");
  }
});
