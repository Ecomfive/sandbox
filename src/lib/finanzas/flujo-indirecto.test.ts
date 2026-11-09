import { strict as assert } from "node:assert";
import { test } from "node:test";
import { flujoIndirecto, variacionSaldo } from "./flujo-indirecto";

test("variación de un saldo contra el cierre anterior", () => {
  assert.equal(variacionSaldo({ "2026-01-01": 100, "2026-02-01": 160 }, "2026-02-01"), 60);
  assert.equal(variacionSaldo({ "2026-02-01": 160 }, "2026-02-01"), null);
  assert.equal(variacionSaldo({ "2025-12-01": 10, "2026-01-01": 4 }, "2026-01-01"), -6);
});

test("de la utilidad al flujo operativo y su diferencia con el directo", () => {
  const M = "2026-02-01";
  const r = flujoIndirecto({
    meses: [M],
    utilidad: { [M]: 1000 },
    depreciacion: { [M]: 50 },
    dividendos: { [M]: 200 },
    altasBienes: {},
    cxc: { "2026-01-01": 300, [M]: 500 },
    cxp: { "2026-01-01": 100, [M]: 150 },
    inventario: { [M]: 900 },
    operativoDirecto: { [M]: 1100 },
  });
  // 1000 + 50 + 200 − 200 + 50 = 1100
  assert.equal(r.indirecto[M], 1100);
  assert.equal(r.diferencia[M], 0);
  assert.deepEqual(r.sinInventario, [M]);
  assert.equal(r.filas.at(-1)!.etiqueta, "Diferencia por conciliar");
});
