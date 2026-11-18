import assert from "node:assert/strict";
import test from "node:test";
import { tramosDeHistorial } from "./tramos";

test("el historial se parte en tramos de 30 días, del más nuevo al más viejo, sin huecos ni solapes", () => {
  assert.deepEqual(tramosDeHistorial("2026-11-18", 90), [
    { desde: "2026-10-20", hasta: "2026-11-18" },
    { desde: "2026-09-20", hasta: "2026-10-19" },
    { desde: "2026-08-21", hasta: "2026-09-19" },
  ]);
});

test("el último tramo es más corto si no divide justo, y nunca pasa de 37 meses", () => {
  const t = tramosDeHistorial("2026-11-18", 45);
  assert.equal(t.length, 2);
  assert.deepEqual(t[1], { desde: "2026-10-05", hasta: "2026-10-19" });
  assert.ok(tramosDeHistorial("2026-11-18", 99999).length <= 39);
  assert.equal(tramosDeHistorial("2026-11-18", 0).length, 1);
});
