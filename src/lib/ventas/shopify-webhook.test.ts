import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { diasRelleno, firmaShopifyValida, saludConexion } from "./shopify-webhook";

const firma = (c: string, s: string) => createHmac("sha256", s).update(c).digest("base64");

test("firma de Shopify", () => {
  assert.equal(firmaShopifyValida("{}", firma("{}", "k"), "k"), true);
  assert.equal(firmaShopifyValida("{}", firma("{}", "otro"), "k"), false);
  assert.equal(firmaShopifyValida("{}", firma("{}", "k"), undefined), false);
  assert.equal(firmaShopifyValida("{}", null, "k"), false);
  assert.equal(firmaShopifyValida("{}x", firma("{}", "k"), "k"), false);
});

test("salud de la conexión", () => {
  const ahora = Date.parse("2026-11-02T12:00:00Z");
  const h = (n: number) => new Date(ahora - n * 3_600_000).toISOString();
  const base = { activa: true, error: null, ultimaLectura: null, ultimoWebhook: null };
  assert.equal(saludConexion({ ...base, activa: false }, ahora).tono, "aviso");
  assert.equal(saludConexion({ ...base, error: "x" }, ahora).tono, "error");
  assert.equal(saludConexion(base, ahora).tono, "aviso");
  assert.equal(saludConexion({ ...base, ultimaLectura: h(1) }, ahora).tono, "ok");
  assert.equal(saludConexion({ ...base, ultimaLectura: h(5) }, ahora).tono, "aviso");
  assert.equal(saludConexion({ ...base, ultimaLectura: h(20) }, ahora).tono, "error");
  assert.equal(saludConexion({ ...base, ultimaLectura: h(20), ultimoWebhook: h(0.5) }, ahora).tono, "ok");
});

test("días de relleno", () => {
  assert.equal(diasRelleno(7), 7);
  assert.equal(diasRelleno(999), 60);
  assert.equal(diasRelleno(-3), 1);
  assert.equal(diasRelleno("x"), 7);
});
