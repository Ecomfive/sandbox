import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DIAS_PERIODO, resolverPeriodo } from "./periodo";

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

test("un rango personalizado de más de un año se recorta a los días más recientes", () => {
  const p = resolverPeriodo({ desde: "2020-01-01", hasta: "2026-10-31" });
  assert.equal(p.hasta, "2026-10-31");
  assert.equal(dias(p.desde, p.hasta), MAX_DIAS_PERIODO);
  assert.equal(p.recortado, true);
});

test("un rango corto no cambia", () => {
  const p = resolverPeriodo({ desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(p.desde, "2026-10-01");
  assert.equal(p.recortado, undefined);
});

test("fechas invertidas se ordenan y una inválida cae al preset", () => {
  assert.equal(resolverPeriodo({ desde: "2026-10-31", hasta: "2026-10-01" }).desde, "2026-10-01");
  assert.equal(resolverPeriodo({ desde: "nada", hasta: "2026-10-01" }).preset, "7d");
});
