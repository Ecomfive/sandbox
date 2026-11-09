import assert from "node:assert/strict";
import { test } from "node:test";
import { rachaFueraDePlazo } from "./rutas-envio";

const e = (llegada: string, dias: number) => ({ llegada, dias });

test("cuenta los últimos seguidos fuera de plazo", () => {
  assert.equal(rachaFueraDePlazo([e("2026-10-01", 90), e("2026-09-01", 95), e("2026-08-01", 70), e("2026-11-01", 85)], 80), 3);
});
test("el último a tiempo corta la racha; sin plazo no hay racha", () => {
  assert.equal(rachaFueraDePlazo([e("2026-11-01", 60), e("2026-10-01", 95)], 80), 0);
  assert.equal(rachaFueraDePlazo([e("2026-11-01", 95)], null), 0);
});
test("una fecha mal puesta no cuenta", () => assert.equal(rachaFueraDePlazo([e("2026-11-01", 900), e("2026-10-01", 90)], 80), 1));
