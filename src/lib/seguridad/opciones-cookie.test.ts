// Opciones de las cookies de preferencia (auditoría de seguridad, 18 nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { UN_ANO_SEGUNDOS, opcionesCookiePreferencia } from "./opciones-cookie";

const conEntorno = (valor: string | undefined, fn: () => void) => {
  const env = process.env as Record<string, string | undefined>;
  const antes = env.NODE_ENV;
  if (valor === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = valor;
  try {
    fn();
  } finally {
    if (antes === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = antes;
  }
};

test("httpOnly, SameSite=Lax, toda la app y la duración pedida", () => {
  const o = opcionesCookiePreferencia(UN_ANO_SEGUNDOS);
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, "lax");
  assert.equal(o.path, "/");
  assert.equal(o.maxAge, 31_536_000);
});

test("secure solo en producción (en localhost por http no se guardaría)", () => {
  conEntorno("production", () => assert.equal(opcionesCookiePreferencia(1).secure, true));
  conEntorno("development", () => assert.equal(opcionesCookiePreferencia(1).secure, false));
  conEntorno(undefined, () => assert.equal(opcionesCookiePreferencia(1).secure, false));
});
