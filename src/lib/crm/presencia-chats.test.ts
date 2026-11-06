import assert from "node:assert/strict";
import test from "node:test";
import { personasConectadas, personasPorChat, sigueActiva, personasFuera } from "./presencia-chats";

test("cada persona sale en el chat que tiene abierto, y yo no salgo", () => {
  const estado = { yo: [{ chat: "a", activa: true }], maria: [{ chat: "a", activa: true }], luis: [{ chat: "b", activa: true }], ana: [{ chat: null, activa: true }] };
  assert.deepEqual(personasPorChat(estado, "yo"), { a: ["maria"], b: ["luis"] });
});

test("con dos pestañas sale en los dos chats, y en el mismo chat una sola vez", () => {
  assert.deepEqual(personasPorChat({ maria: [{ chat: "a", activa: true }, { chat: "b", activa: true }] }, "yo"), { a: ["maria"], b: ["maria"] });
  assert.deepEqual(personasPorChat({ maria: [{ chat: "a", activa: true }, { chat: "a", activa: true }] }, "yo"), { a: ["maria"] });
});

test("varias personas en un chat salen siempre en el mismo orden", () => {
  assert.deepEqual(personasPorChat({ zoe: [{ chat: "a", activa: true }], ana: [{ chat: "a", activa: true }] }, "yo"), { a: ["ana", "zoe"] });
});

test("a la vista cuenta 5 minutos sin uso; en otra pestaña, 1 minuto", () => {
  assert.equal(sigueActiva(4 * 60_000, true), true);
  assert.equal(sigueActiva(5 * 60_000, true), false);
  assert.equal(sigueActiva(30_000, false), true);
  assert.equal(sigueActiva(60_000, false), false);
});

test("la barra muestra a los demás que están trabajando, con su chat; quien no usa el sistema no sale", () => {
  const estado = {
    yo: [{ chat: "a", activa: true }],
    maria: [{ chat: "a", activa: true }, { chat: "b", activa: true }],
    luis: [{ chat: null, activa: true }],
    ana: [{ chat: null, activa: false }],
    zoe: [{ chat: null, activa: false }, { chat: "c", activa: true }],
  };
  assert.deepEqual(personasConectadas(estado, "yo"), [
    { id: "luis", chats: [] },
    { id: "maria", chats: ["a", "b"] },
    { id: "zoe", chats: ["c"] },
  ]);
});

test("Dirección ve a quien usa el sistema aunque no salga en vivo, sin repetir a nadie", () => {
  const enSistema = [{ id: "nicol", pagina: "Bandeja de WhatsApp" }, { id: "ana", pagina: "Compras" }, { id: "yo", pagina: "Compras" }];
  assert.deepEqual(personasFuera(enSistema, [{ id: "ana", chats: [] }], "yo"), [{ id: "nicol", pagina: "Bandeja de WhatsApp" }]);
});
