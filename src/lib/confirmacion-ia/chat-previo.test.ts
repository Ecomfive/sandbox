import assert from "node:assert/strict";
import test from "node:test";
import { conversacionParaJuez, leerVeredictoChat, limpiarParaJuez, pedidoJuez, puedeEscribirseAlCliente } from "./chat-previo";

test("antes de mandarlo a la IA se quitan teléfonos, correos y enlaces", () => {
  const t = limpiarParaJuez("Escríbeme al +507 6123-4567 o a ana@correo.com, mira https://x.com/p y www.tienda.com");
  assert.ok(!/6123|ana@|https|www\./.test(t), t);
  assert.match(t, /\[número\]/);
  assert.match(t, /\[correo\]/);
});

test("la conversación va del más viejo al más nuevo, con quién habla y solo los últimos", () => {
  const ms = Array.from({ length: 5 }, (_, i) => ({ de: i % 2 ? ("cliente" as const) : ("bot" as const), tipo: "text", texto: `mensaje ${i}` }));
  const c = conversacionParaJuez(ms, 3);
  assert.equal(c, "Tienda: mensaje 2\nCliente: mensaje 3\nTienda: mensaje 4");
  assert.equal(conversacionParaJuez([{ de: "equipo", tipo: "image", texto: "" }, { de: "cliente", tipo: "text", texto: "   " }]), "Tienda: [image]");
});

test("la pregunta cambia según sea un dato de la dirección o el pago por adelantado", () => {
  const dato = pedidoJuez({ tipo: "dato", falta: "el número de casa", direccion: "Calle 5", ciudad: "David", conversacion: "Cliente: hola" });
  assert.match(dato.texto, /el número de casa/);
  assert.match(dato.texto, /DIRECCIÓN DEL PEDIDO/);
  const pago = pedidoJuez({ tipo: "adelanto", falta: null, direccion: "Calle 5", ciudad: null, conversacion: "Cliente: hola" });
  assert.match(pago.texto, /PAGO POR ADELANTADO/);
  assert.ok(!/DIRECCIÓN DEL PEDIDO/.test(pago.texto));
  assert.match(pago.instrucciones, /no_claro/);
});

test("solo un «no» claro deja escribirle al cliente", () => {
  assert.deepEqual(leerVeredictoChat('{"ya_se_lo_pidieron":"si","motivo":"El bot pidió la referencia"}'), { ya: true, motivo: "El bot pidió la referencia" });
  assert.equal(leerVeredictoChat('Claro: {"ya_se_lo_pidieron":"no","motivo":"solo saludos"}').ya, false);
  assert.equal(leerVeredictoChat('{"ya_se_lo_pidieron":"no_claro"}').ya, null);
  assert.equal(leerVeredictoChat("no sé").ya, null);
  assert.equal(leerVeredictoChat("{roto").ya, null);
  assert.equal(puedeEscribirseAlCliente({ ya: false, motivo: "" }), true);
  assert.equal(puedeEscribirseAlCliente({ ya: true, motivo: "" }), false);
  assert.equal(puedeEscribirseAlCliente({ ya: null, motivo: "" }), false);
});
