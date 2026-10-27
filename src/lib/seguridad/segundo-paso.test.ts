import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codigoCoincide,
  correoDelCodigo,
  enmascararCorreo,
  ESPERA_REENVIO_SEG,
  firmarMarca,
  generarCodigo,
  huellaCodigo,
  marcaValida,
  normalizarCodigo,
  segundoPasoActivo,
  segundosParaReenviar,
  sesionDeToken,
} from "./segundo-paso";

const SECRETO = "s".repeat(40);
const USUARIO = "11111111-1111-1111-1111-111111111111";

test("está apagada salvo que se pidan las dos variables, y el secreto sea largo", () => {
  assert.equal(segundoPasoActivo({}), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "activo" }), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "activo", SEGUNDO_PASO_SECRETO: "corto" }), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "desactivado", SEGUNDO_PASO_SECRETO: SECRETO }), false);
  assert.equal(segundoPasoActivo({ SEGUNDO_PASO: "activo", SEGUNDO_PASO_SECRETO: SECRETO }), true);
});

test("el código es de 6 dígitos y se lee aunque lo escriban con espacios o guion", () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/);
  assert.equal(normalizarCodigo("123 456"), "123456");
  assert.equal(normalizarCodigo("123-456"), "123456");
  assert.equal(normalizarCodigo("000012"), "000012");
  assert.equal(normalizarCodigo("12345"), null);
  assert.equal(normalizarCodigo("1234567"), null);
  assert.equal(normalizarCodigo("12a456"), null);
  assert.equal(normalizarCodigo(null), null);
});

test("la huella del código está atada a la persona y al secreto", () => {
  const h = huellaCodigo(USUARIO, "123456", SECRETO);
  assert.equal(codigoCoincide(h, USUARIO, "123456", SECRETO), true);
  assert.equal(codigoCoincide(h, USUARIO, "123457", SECRETO), false);
  assert.equal(codigoCoincide(h, "22222222-2222-2222-2222-222222222222", "123456", SECRETO), false);
  assert.equal(codigoCoincide(h, USUARIO, "123456", "otro-secreto".padEnd(40, "x")), false);
  assert.ok(!h.includes("123456"));
});

test("la marca de segundo paso cumplido sirve solo para esa persona, esa sesión y antes de vencer", () => {
  const ahora = Date.now();
  const vence = ahora + 3_600_000;
  const marca = firmarMarca(USUARIO, "sesion-1", vence, SECRETO);
  assert.equal(marcaValida(marca, USUARIO, "sesion-1", ahora, SECRETO), true);
  // Otra sesión (un ingreso nuevo) vuelve a pedir el código.
  assert.equal(marcaValida(marca, USUARIO, "sesion-2", ahora, SECRETO), false);
  assert.equal(marcaValida(marca, "22222222-2222-2222-2222-222222222222", "sesion-1", ahora, SECRETO), false);
  assert.equal(marcaValida(marca, USUARIO, "sesion-1", vence + 1, SECRETO), false);
  assert.equal(marcaValida(marca, USUARIO, "sesion-1", ahora, "otro-secreto".padEnd(40, "x")), false);
  // Cambiar la fecha de vencimiento rompe la firma.
  assert.equal(marcaValida(`${vence + 999_999}.${marca.split(".")[1]}`, USUARIO, "sesion-1", ahora, SECRETO), false);
  for (const mala of [undefined, null, "", "abc", "1.2.3", `${vence}.`, `.${marca.split(".")[1]}`]) assert.equal(marcaValida(mala, USUARIO, "sesion-1", ahora, SECRETO), false);
  assert.equal(marcaValida(marca, USUARIO, null, ahora, SECRETO), false);
});

test("de un token de Supabase salen la sesión y el nivel de verificación", () => {
  const cuerpo = (o: object) => `x.${Buffer.from(JSON.stringify(o)).toString("base64url")}.y`;
  assert.deepEqual(sesionDeToken(cuerpo({ session_id: "abc", aal: "aal2" })), { sesionId: "abc", aal: "aal2" });
  assert.deepEqual(sesionDeToken(cuerpo({ session_id: "abc", aal: "aal1" })), { sesionId: "abc", aal: "aal1" });
  assert.deepEqual(sesionDeToken(cuerpo({})), { sesionId: null, aal: null });
  assert.deepEqual(sesionDeToken("basura"), { sesionId: null, aal: null });
  assert.deepEqual(sesionDeToken(null), { sesionId: null, aal: null });
});

test("el correo se enmascara y el mensaje solo lleva el código", () => {
  assert.equal(enmascararCorreo("hernan@gmail.com"), "he••••@gmail.com");
  assert.match(enmascararCorreo("a@b.com"), /@b\.com$/);
  assert.equal(enmascararCorreo("sin-arroba"), "tu correo");
  const c = correoDelCodigo("042 917".replace(" ", ""));
  assert.match(c.asunto, /042917/);
  assert.match(c.html, /042917/);
});

test("entre un código y el siguiente hay que esperar", () => {
  const ahora = Date.parse("2026-10-27T12:00:30Z");
  assert.equal(segundosParaReenviar(null, ahora), 0);
  assert.equal(segundosParaReenviar("2026-10-27T12:00:00Z", ahora), ESPERA_REENVIO_SEG - 30);
  assert.equal(segundosParaReenviar("2026-10-27T11:00:00Z", ahora), 0);
});
