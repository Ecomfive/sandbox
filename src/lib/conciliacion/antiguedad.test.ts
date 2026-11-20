import { test } from "node:test";
import assert from "node:assert/strict";
import { antiguedadPorCuenta } from "./antiguedad";

test("reparte lo abierto en tramos y marca las cuentas atrasadas", () => {
  const r = antiguedadPorCuenta(
    [
      { cuentaId: "a", fecha: "2026-11-15", monto: -10 },
      { cuentaId: "a", fecha: "2026-11-01", monto: 20 },
      { cuentaId: "a", fecha: "2026-09-30", monto: -5.5 },
      { cuentaId: "b", fecha: "2026-11-18", monto: 3 },
    ],
    new Map([
      ["a", "2026-10-30T12:00:00Z"],
      ["b", "2026-11-17T09:00:00Z"],
      ["c", "2026-11-01T09:00:00Z"],
    ]),
    "2026-11-19",
    7,
  );
  const a = r.find((x) => x.cuentaId === "a")!;
  assert.deepEqual(a.tramos, { hasta7: 1, hasta30: 1, mas30: 1 });
  assert.deepEqual(a.montos, { hasta7: 10, hasta30: 20, mas30: 5.5 });
  assert.equal(a.diasSinConciliar, 20);
  assert.equal(a.atrasada, true);
  assert.equal(r.find((x) => x.cuentaId === "b")!.atrasada, false);
  // Sin nada abierto no está atrasada aunque haga mucho que no se concilia.
  assert.equal(r.find((x) => x.cuentaId === "c")!.atrasada, false);
  assert.equal(r[0].cuentaId, "a");
});

test("nunca conciliada: cuenta desde la línea pendiente más vieja", () => {
  const [c] = antiguedadPorCuenta([{ cuentaId: "x", fecha: "2026-11-01", monto: 1 }], new Map(), "2026-11-19", 7);
  assert.equal(c.diasSinConciliar, 18);
  assert.equal(c.atrasada, true);
});
