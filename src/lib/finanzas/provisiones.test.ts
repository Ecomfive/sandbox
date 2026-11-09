import { test } from "node:test";
import assert from "node:assert/strict";
import { TASA_PROVISION, partidaXiii, proponerProvisiones } from "./provisiones";

test("tasas de ley", () => {
  assert.equal(Math.round(TASA_PROVISION.prima * 100000) / 1000, 1.923);
  assert.equal(TASA_PROVISION.xiii, 1 / 12);
  assert.equal(TASA_PROVISION.vacaciones, 1 / 11);
});

test("provisiones por tienda, sin tienda va a la de por defecto", () => {
  const p = proponerProvisiones(
    [
      { unidadId: "t1", bruto: 1200 },
      { unidadId: null, bruto: 1100 },
      { unidadId: "t1", bruto: 0 },
    ],
    "corp",
  );
  assert.equal(p.length, 3);
  const xiii = p.find((x) => x.clave === "xiii")!;
  assert.equal(xiii.base, 2300);
  assert.equal(xiii.monto, 191.67);
  assert.equal(Math.round(xiii.lineas.reduce((a, l) => a + l.monto, 0) * 100) / 100, xiii.monto);
  assert.deepEqual(xiii.lineas.map((l) => l.unidadId).sort(), ["corp", "t1"]);
  assert.equal(p.find((x) => x.clave === "vacaciones")!.monto, 209.09);
  assert.equal(p.find((x) => x.clave === "prima")!.monto, 44.23);
});

test("sin planilla no hay propuesta", () => {
  assert.deepEqual(proponerProvisiones([], "corp"), []);
});

test("partidas del XIII mes", () => {
  assert.deepEqual(partidaXiii("2026-03-01"), { partida: 1, pago: "2026-04-15" });
  assert.deepEqual(partidaXiii("2026-07-01"), { partida: 2, pago: "2026-08-15" });
  assert.deepEqual(partidaXiii("2026-10-01"), { partida: 3, pago: "2026-12-15" });
});
