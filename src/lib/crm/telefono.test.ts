import assert from "node:assert/strict";
import { test } from "node:test";
import { codigoPais, listaDePaises, normalizarTelefono, telefonosDeChatPosibles } from "./telefono";

// Se corre con: npm run test:seguridad (incluye estas pruebas del CRM)
// Los números son inventados: son de ejemplo con el formato de cada país.

test("normaliza un teléfono con prefijo escrito de varias maneras", () => {
  for (const t of ["+57 300 111 2233", "+57-300-111-2233", "0057 300 111 2233", " +573001112233 "]) {
    assert.deepEqual(normalizarTelefono(t), { e164: "+573001112233", pais: "CO" }, t);
  }
});

test("usa el país por defecto cuando el número no trae prefijo", () => {
  assert.deepEqual(normalizarTelefono("300 111 2233", "CO"), { e164: "+573001112233", pais: "CO" });
  assert.deepEqual(normalizarTelefono("6123-4567", "PA"), { e164: "+50761234567", pais: "PA" });
  assert.deepEqual(normalizarTelefono("8312 3456", "CR"), { e164: "+50683123456", pais: "CR" });
});

test("reconoce el país de origen por el prefijo", () => {
  assert.equal(normalizarTelefono("+52 55 1234 5678")?.pais, "MX");
  assert.equal(normalizarTelefono("+507 6123 4567")?.pais, "PA");
  assert.equal(normalizarTelefono("+506 8312 3456")?.pais, "CR");
});

test("rechaza lo que no es un teléfono válido, en vez de guardar uno equivocado", () => {
  assert.equal(normalizarTelefono(""), null);
  assert.equal(normalizarTelefono(null), null);
  assert.equal(normalizarTelefono("abc"), null);
  assert.equal(normalizarTelefono("123"), null);
  assert.equal(normalizarTelefono("300 111 2233"), null, "sin prefijo ni país por defecto no se puede saber de dónde es");
});

test("entiende nombres de país con y sin tilde", () => {
  assert.equal(codigoPais("Panamá"), "PA");
  assert.equal(codigoPais("panama"), "PA");
  assert.equal(codigoPais("Costa Rica"), "CR");
  assert.equal(codigoPais("MÉXICO"), "MX");
  assert.equal(codigoPais("co"), "CO");
  assert.equal(codigoPais("Narnia"), null);
  assert.equal(codigoPais(""), null);
});

test("separa una lista de países escrita de varias formas", () => {
  assert.deepEqual(listaDePaises("Panamá, Costa Rica"), { codigos: ["PA", "CR"], noReconocidos: [] });
  assert.deepEqual(listaDePaises("PA / CR"), { codigos: ["PA", "CR"], noReconocidos: [] });
  assert.deepEqual(listaDePaises("Panamá y Costa Rica"), { codigos: ["PA", "CR"], noReconocidos: [] });
  assert.deepEqual(listaDePaises("Panamá, Panamá"), { codigos: ["PA"], noReconocidos: [] });
  assert.deepEqual(listaDePaises("Panamá, Narnia"), { codigos: ["PA"], noReconocidos: ["Narnia"] });
});

// El chat de WhatsApp de un pedido de tienda se busca por el teléfono completo así normalizado (auditoría de seguridad, 18 nov 2026).
test("el teléfono de un pedido llega al mismo número con o sin prefijo, y no a otro que comparte los últimos dígitos", () => {
  for (const t of ["6123-4567", "+507 6123 4567", "507 6123 4567", "50761234567", "00507 6123 4567"]) {
    assert.equal(normalizarTelefono(t, "PA")?.e164, "+50761234567", t);
  }
  assert.equal(normalizarTelefono("+506 6123 4567", "PA")?.e164, "+50661234567");
  assert.equal(normalizarTelefono("61234567", null), null);
});

test("el chat de un pedido también se busca como lo escribe WhatsApp en México y Argentina", () => {
  const mx = ["+525512345678", "+5215512345678"];
  assert.deepEqual(telefonosDeChatPosibles("55 1234 5678", "MX").sort(), mx.sort());
  assert.deepEqual(telefonosDeChatPosibles("+52 1 55 1234 5678", "PA").sort(), mx.sort());
  assert.deepEqual(telefonosDeChatPosibles("5215512345678", "MX").sort(), mx.sort());
  const ar = ["+541112345678", "+5491112345678"];
  assert.deepEqual(telefonosDeChatPosibles("011 15 1234-5678", "AR").sort(), ar.sort());
  assert.deepEqual(telefonosDeChatPosibles("+54 11 1234 5678", "AR").sort(), ar.sort());
  assert.deepEqual(telefonosDeChatPosibles("+54 9 11 1234 5678", null).sort(), ar.sort());
});

test("el chat de un pedido nunca se busca por otro número que comparte los últimos dígitos", () => {
  assert.deepEqual(telefonosDeChatPosibles("6123-4567", "PA"), ["+50761234567"]);
  assert.deepEqual(telefonosDeChatPosibles("+507 6123 4567", "PA"), ["+50761234567"]);
  assert.deepEqual(telefonosDeChatPosibles("61234567", null), []);
  // Sin el prefijo y de otro país, el 521… no se toma como México.
  assert.deepEqual(telefonosDeChatPosibles("5215512345678", "PA"), []);
});

test("escrito con el prefijo, también tal cual lo guarda el webhook cuando no lo pudo normalizar", () => {
  assert.deepEqual(telefonosDeChatPosibles("+999 1234 5678", null), ["+99912345678"]);
});
