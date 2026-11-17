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
    "Pedido #89311 - Venta manual - WhatsApp +50764641958",
    "Mi pedido #89311 - Venta por bot - WhatsApp +50764641958",
  ]) {
    const r = quitarNotaDelBot(nota);
    assert.equal(r.coincide, false, String(nota));
    assert.equal(r.notaNueva, typeof nota === "string" ? nota : "");
  }
});

test("si el bot pegó el comentario del cliente detrás del teléfono, se quita el encabezado y se conserva el comentario", () => {
  assert.deepEqual(quitarNotaDelBot("Pedido #68496 - Venta por bot - WhatsApp +50765611001, Sábado 31/10 la entrega"), { coincide: true, notaNueva: "Sábado 31/10 la entrega" });
  assert.deepEqual(quitarNotaDelBot("Pedido #60752 - Venta por bot - WhatsApp +50761834550 MARTES A DOMINGO LABORAN LAS 24H"), { coincide: true, notaNueva: "MARTES A DOMINGO LABORAN LAS 24H" });
  assert.deepEqual(quitarNotaDelBot("Pedido #112121 - Venta por bot - WhatsApp +50766820305, 8-281-678"), { coincide: true, notaNueva: "8-281-678" });
  assert.deepEqual(quitarNotaDelBot("Pedido #1 - Venta por bot - WhatsApp +50760000000 8 de la mañana"), { coincide: true, notaNueva: "8 de la mañana" }, "no se lleva los números del comentario");
  assert.deepEqual(quitarNotaDelBot("Pedido #5 - Venta por bot - WhatsApp +50760000000, casa azul\nLlamar antes"), { coincide: true, notaNueva: "casa azul\nLlamar antes" });
});

test("un teléfono demasiado corto o un encabezado distinto no se toca", () => {
  for (const nota of ["Pedido #5 - Venta por bot - WhatsApp +5076, casa azul", "Pedido #5 - Venta por bot - Instagram +50760000000, casa azul", "Nota: Pedido #5 - Venta por bot - WhatsApp +50760000000, casa azul"]) {
    assert.deepEqual(quitarNotaDelBot(nota), { coincide: false, notaNueva: nota }, nota);
  }
});
