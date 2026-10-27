import assert from "node:assert/strict";
import { test } from "node:test";
import { nivelDeToken, normalizarCodigo, segundoPasoActivo } from "./segundo-paso";

test("está apagada salvo que se pida con SEGUNDO_PASO=activo", () => {
  assert.equal(segundoPasoActivo({}), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "desactivado" }), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "Activo" }), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "activo" }), true);
});

test("el código es de 6 dígitos y se lee aunque lo escriban con espacios o guion", () => {
  assert.equal(normalizarCodigo("123 456"), "123456");
  assert.equal(normalizarCodigo("123-456"), "123456");
  assert.equal(normalizarCodigo("000012"), "000012");
  assert.equal(normalizarCodigo("12345"), null);
  assert.equal(normalizarCodigo("1234567"), null);
  assert.equal(normalizarCodigo("12a456"), null);
  assert.equal(normalizarCodigo(null), null);
});

test("del token de Supabase sale el nivel de verificación de la sesión", () => {
  const token = (o: object) => `x.${Buffer.from(JSON.stringify(o)).toString("base64url")}.y`;
  assert.equal(nivelDeToken(token({ aal: "aal2" })), "aal2");
  assert.equal(nivelDeToken(token({ aal: "aal1" })), "aal1");
  assert.equal(nivelDeToken(token({})), null);
  assert.equal(nivelDeToken("basura"), null);
  assert.equal(nivelDeToken(null), null);
});
