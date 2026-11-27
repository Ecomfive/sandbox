import assert from "node:assert/strict";
import test from "node:test";
import { horaDeMeta } from "./hora";

test("la hora se ve en Panamá (UTC−5), no en UTC", () => {
  const t = horaDeMeta("2026-11-23T13:01:00+00:00");
  assert.match(t, /08:01/);
  assert.ok(!/13:01/.test(t), t);
});

test("sin dato o con un dato roto dice «—»", () => {
  assert.equal(horaDeMeta(null), "—");
  assert.equal(horaDeMeta(undefined), "—");
  assert.equal(horaDeMeta("no es una fecha"), "—");
});
