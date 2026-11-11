import { test } from "node:test";
import assert from "node:assert/strict";
import { diaHabilDelMes, diasHabilesEntre, esDiaHabil, feriadosPanama, pascua, siguienteDiaHabil } from "./dias-habiles";

test("pascua de años conocidos", () => {
  assert.equal(pascua(2024), "2024-03-31");
  assert.equal(pascua(2025), "2025-04-20");
  assert.equal(pascua(2026), "2026-04-05");
});

test("feriados de Panamá: carnaval, viernes santo y traslado del domingo", () => {
  const f = feriadosPanama(2026);
  assert.ok(f.has("2026-02-16") && f.has("2026-02-17"), "carnaval");
  assert.ok(f.has("2026-04-03"), "viernes santo");
  assert.ok(f.has("2026-11-03") && f.has("2026-11-28"));
  // 2026-11-28 es sábado (no se traslada); 2027-11-28 es domingo → lunes 29.
  assert.ok(feriadosPanama(2027).has("2027-11-29"));
});

test("día hábil", () => {
  assert.equal(esDiaHabil("2026-10-24"), false, "sábado");
  assert.equal(esDiaHabil("2026-11-04"), false, "feriado");
  assert.equal(esDiaHabil("2026-10-23"), true);
  assert.equal(siguienteDiaHabil("2026-11-03"), "2026-11-06");
  assert.equal(siguienteDiaHabil("2026-10-23"), "2026-10-23");
});

test("día hábil N del mes", () => {
  // Enero 2026: 1 feriado (jue), 2 vie hábil, 5 lun, 6, 7, 8 (9 feriado vie).
  assert.equal(diaHabilDelMes("2026-01-01", 1), "2026-01-02");
  assert.equal(diaHabilDelMes("2026-01-01", 5), "2026-01-08");
  assert.equal(diaHabilDelMes("2026-01-01", 6), "2026-01-12");
  // Más días que los del mes: el último hábil.
  assert.equal(diaHabilDelMes("2026-02-01", 40).slice(0, 7), "2026-02");
});

test("días hábiles entre dos fechas", () => {
  assert.equal(diasHabilesEntre("2026-10-23", "2026-10-26"), 1);
  assert.equal(diasHabilesEntre("2026-10-26", "2026-10-23"), -1);
  assert.equal(diasHabilesEntre("2026-10-23", "2026-10-23"), 0);
});
