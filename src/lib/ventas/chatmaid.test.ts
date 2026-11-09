import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { aE164, estadoSiguiente, firmaChatmaidValida, interpretarRespuesta, textoAviso } from "./chatmaid";

test("E.164 por país", () => {
  assert.equal(aE164("PA", "61234567"), "+50761234567");
  assert.equal(aE164("MX", "5512345678"), "+525512345678");
  assert.equal(aE164("CR", ""), null);
});
test("respuestas del cliente", () => {
  assert.equal(interpretarRespuesta("1"), "confirma");
  assert.equal(interpretarRespuesta("Sí, confirmo"), "confirma");
  assert.equal(interpretarRespuesta("2"), "cancela");
  assert.equal(interpretarRespuesta("No gracias"), "cancela");
  assert.equal(interpretarRespuesta("sí pero cámbienme la dirección por favor ahora"), null);
  assert.equal(interpretarRespuesta("¿cuándo llega?"), null);
});
test("estado no retrocede", () => {
  assert.equal(estadoSiguiente("leido", "enviado"), "leido");
  assert.equal(estadoSiguiente("enviado", "leido"), "leido");
  assert.equal(estadoSiguiente("entregado", "fallido"), "entregado");
  assert.equal(estadoSiguiente("pendiente", "fallido"), "fallido");
});
test("firma del webhook", () => {
  const cuerpo = '{"a":1}', ts = "1790000000", s = "secreto";
  const v1 = createHmac("sha256", s).update(`${ts}.${cuerpo}`).digest("hex");
  const ahora = 1790000000_000;
  assert.equal(firmaChatmaidValida(cuerpo, `t=${ts},v1=${v1}`, s, ahora), true);
  assert.equal(firmaChatmaidValida(cuerpo + " ", `t=${ts},v1=${v1}`, s, ahora), false);
  assert.equal(firmaChatmaidValida(cuerpo, `t=${ts},v1=${v1}`, s, ahora + 6 * 60_000), false);
  assert.equal(firmaChatmaidValida(cuerpo, `t=${ts},v1=abc`, s, ahora), false);
  assert.equal(firmaChatmaidValida(cuerpo, `t=${ts},v1=${v1}`, undefined, ahora), false);
});
test("textos sin datos sobrantes", () => {
  const d = { nombre: "María Pérez", tienda: "Kenku", numero: "#1001", productos: "Crema", guia: "G123", con: "Servientrega" };
  assert.match(textoAviso("confirmar", d), /Hola María/);
  assert.match(textoAviso("guia", d), /G123/);
  assert.match(textoAviso("guia", { ...d, guia: null }), /aún no hay guía/);
});
