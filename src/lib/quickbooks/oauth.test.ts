import assert from "node:assert/strict";
import test from "node:test";
import { firmarState, leerConfigQbo, leerRealmId, leerRespuestaTokens, necesitaRenovar, urlAutorizacion, variablesQboFaltantes, verificarState } from "./oauth";

const ENV = {
  QBO_CLIENT_ID: "cliente-prueba",
  QBO_CLIENT_SECRET: "secreto-prueba",
  QBO_REDIRECT_URI: "https://portal.ejemplo.test/api/quickbooks/retorno",
  QBO_TOKEN_KEY: "ab".repeat(32),
};

test("configuración: lo que falta y el entorno", () => {
  assert.deepEqual(variablesQboFaltantes({}), ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REDIRECT_URI", "QBO_TOKEN_KEY"]);
  assert.deepEqual(variablesQboFaltantes(ENV), []);
  assert.ok(variablesQboFaltantes({ ...ENV, QBO_TOKEN_KEY: "corta" }).some((x) => x.startsWith("QBO_TOKEN_KEY")));
  assert.ok(variablesQboFaltantes({ ...ENV, QBO_REDIRECT_URI: "http://sitio.test/x" }).length === 1);
  assert.equal(leerConfigQbo({})?.entorno, undefined);
  assert.equal(leerConfigQbo(ENV)?.entorno, "sandbox");
  assert.equal(leerConfigQbo({ ...ENV, QBO_ENTORNO: "production" })?.entorno, "production");
});

test("state firmado: válido, vencido, otra persona, otro navegador, alterado", () => {
  const cfg = leerConfigQbo(ENV)!;
  const ahora = 1_800_000_000_000;
  const s = firmarState({ usuarioId: "u1", nonce: "n1", vence: ahora + 60_000 }, cfg.clave);
  assert.deepEqual(verificarState(s, { usuarioId: "u1", nonceCookie: "n1", ahora }, cfg.clave), { ok: true });
  assert.equal(verificarState(s, { usuarioId: "u1", nonceCookie: "n1", ahora: ahora + 120_000 }, cfg.clave).ok, false);
  assert.equal(verificarState(s, { usuarioId: "u2", nonceCookie: "n1", ahora }, cfg.clave).ok, false);
  assert.equal(verificarState(s, { usuarioId: "u1", nonceCookie: "otro", ahora }, cfg.clave).ok, false);
  assert.equal(verificarState(s, { usuarioId: "u1", nonceCookie: null, ahora }, cfg.clave).ok, false);
  const [cuerpo] = s.split(".");
  assert.equal(verificarState(`${cuerpo}.firmafalsa`, { usuarioId: "u1", nonceCookie: "n1", ahora }, cfg.clave).ok, false);
  assert.equal(verificarState(null, { usuarioId: "u1", nonceCookie: "n1", ahora }, cfg.clave).ok, false);
});

test("urlAutorizacion lleva alcance, redirect y state", () => {
  const u = new URL(urlAutorizacion({ clientId: "c", redirectUri: "https://x.test/r" }, "st"));
  assert.equal(u.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(u.searchParams.get("redirect_uri"), "https://x.test/r");
  assert.equal(u.searchParams.get("state"), "st");
  assert.equal(u.searchParams.get("response_type"), "code");
});

test("respuesta de tokens y renovación", () => {
  const ahora = Date.UTC(2026, 9, 1);
  const t = leerRespuestaTokens({ access_token: "a", refresh_token: "r", expires_in: 3600, x_refresh_token_expires_in: 8726400, token_type: "bearer" }, ahora)!;
  assert.equal(t.accessExpira, "2026-10-01T01:00:00.000Z");
  assert.ok(t.refreshExpira!.startsWith("2027-01"));
  assert.equal(leerRespuestaTokens({ access_token: "a" }, ahora), null);
  assert.ok(necesitaRenovar(t.accessExpira, ahora + 57 * 60_000));
  assert.ok(!necesitaRenovar(t.accessExpira, ahora + 30 * 60_000));
  assert.equal(leerRealmId("9130350000000000"), "9130350000000000");
  assert.equal(leerRealmId("12a"), null);
});
