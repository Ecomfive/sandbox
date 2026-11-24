import assert from "node:assert/strict";
import test from "node:test";
import { ventas30PorPublicacion, ventasEnCaidaDrop, verificarDropshipperDrop } from "./ventas";

const reglas = { caida_ventas: 0.5, min_ventas_antes: 10, dias_nuevo: 30 };

test("ventas de 30 días y de los 30 anteriores, netas de devoluciones", () => {
  const m = ventas30PorPublicacion(
    [
      { producto_id: "a", dia: "2026-11-24", salidas: 5, devueltas: 1 },
      { producto_id: "a", dia: "2026-10-26", salidas: 3, devueltas: 0 },
      { producto_id: "a", dia: "2026-10-25", salidas: 20, devueltas: 2 },
      { producto_id: "a", dia: "2026-09-26", salidas: 9, devueltas: 0 },
      { producto_id: "a", dia: "2026-09-25", salidas: 99, devueltas: 0 },
    ],
    "2026-11-24",
  );
  assert.deepEqual(m.get("a"), { netas30: 7, netasAntes: 27 });
});

test("ventas en caída: solo si antes vendió lo mínimo y ahora menos de la mitad", () => {
  assert.equal(ventasEnCaidaDrop({ netas30: 4, netasAntes: 20 }, reglas), true);
  assert.equal(ventasEnCaidaDrop({ netas30: 10, netasAntes: 20 }, reglas), false);
  assert.equal(ventasEnCaidaDrop({ netas30: 0, netasAntes: 8 }, reglas), false, "antes vendía poco: no se mide");
  assert.equal(ventasEnCaidaDrop(null, reglas), false);
});

test("verificar dropshipper: exclusivo activo, no nuevo y sin ventas en 30 días", () => {
  const base = { clientesExclusivos: ["Tienda X"], creadoEnDrop: "2026-09-01T00:00:00Z", ventas: { netas30: 0, netasAntes: 5 } };
  assert.equal(verificarDropshipperDrop(base, "2026-11-24", reglas), true);
  assert.equal(verificarDropshipperDrop({ ...base, ventas: { netas30: 2, netasAntes: 0 } }, "2026-11-24", reglas), false);
  assert.equal(verificarDropshipperDrop({ ...base, clientesExclusivos: [] }, "2026-11-24", reglas), false);
  assert.equal(verificarDropshipperDrop({ ...base, creadoEnDrop: "2026-11-10T00:00:00Z" }, "2026-11-24", reglas), false, "nuevo");
  assert.equal(verificarDropshipperDrop({ ...base, ventas: null }, "2026-11-24", reglas), false, "sin lectura de ventas");
});
