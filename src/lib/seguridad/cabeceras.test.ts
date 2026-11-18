// Cabeceras de seguridad HTTP (auditoría de seguridad, 18 nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HSTS, POLITICA_BASE, llevaPoliticaConNonce, nuevoNonce, politicaConNonce } from "./cabeceras";

test("el nonce es base64 de 16 bytes y cambia en cada llamada", () => {
  const a = nuevoNonce();
  const b = nuevoNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.equal(Buffer.from(a, "base64").length, 16);
  assert.notEqual(a, b);
});

test("la política de una página lleva la base y script-src con el nonce, sin unsafe-inline", () => {
  const p = politicaConNonce("abc123", false);
  assert.ok(p.startsWith(POLITICA_BASE));
  assert.match(p, /; script-src 'self' 'nonce-abc123' 'strict-dynamic'; worker-src 'self'$/);
  assert.doesNotMatch(p, /unsafe-inline|unsafe-eval/);
  assert.match(p, /frame-ancestors 'none'/);
  assert.match(p, /object-src 'none'/);
});

test("en desarrollo se permite eval (React lo usa); en producción no", () => {
  assert.match(politicaConNonce("n", true), /'unsafe-eval'/);
  assert.doesNotMatch(politicaConNonce("n", false), /'unsafe-eval'/);
});

test("las rutas de /api no llevan la política con nonce; las páginas sí", () => {
  assert.equal(llevaPoliticaConNonce("/api"), false);
  assert.equal(llevaPoliticaConNonce("/api/whatsapp/media/1"), false);
  assert.equal(llevaPoliticaConNonce("/"), true);
  assert.equal(llevaPoliticaConNonce("/login"), true);
  assert.equal(llevaPoliticaConNonce("/proveedor/abc"), true);
  assert.equal(llevaPoliticaConNonce("/apicola"), true);
});

test("HSTS: dos años, subdominios y sin preload", () => {
  assert.equal(HSTS, "max-age=63072000; includeSubDomains");
});

test("el límite de scripts solo bloquea con CSP_SCRIPTS_ESTRICTA", async () => {
  const { scriptsEstrictos } = await import("./cabeceras");
  assert.equal(scriptsEstrictos({}), false);
  assert.equal(scriptsEstrictos({ CSP_SCRIPTS_ESTRICTA: "0" }), false);
  assert.equal(scriptsEstrictos({ CSP_SCRIPTS_ESTRICTA: "1" }), true);
  assert.equal(scriptsEstrictos({ CSP_SCRIPTS_ESTRICTA: " TRUE " }), true);
});
